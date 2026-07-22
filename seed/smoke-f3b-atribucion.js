// Smoke F3b — atribución por lugar + vigencia. EJECUTA areaVigente / resolverAtribucionLugar / resolverAtribucion
// (extraídas por nombre) con db/document mockeados. Verifica: vigencia estricta, prioridad LUGAR, caída a persona,
// snapshot con traza, y el banner de 3 estados (cubre / sin-vigencia / nada).
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { lines, fns, konst } = require('./lib/extract');
const L = lines('app/index.html');

const CALLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'calles-pergamino.json'), 'utf8'));
const src = konst(L, 'CALLE_ALIAS') + '\n' + fns(L, [
  'geoStripAccents','geoNormStreet','normalizarDireccion','calleSlug','callesIndex','resolverCalleId','calleCanon',
  'tsMsOf','areaVigente','resolverAtribucionLugar','resolverAtribucion',
  'dspAreaSet','dspAreaKey','dspAreaMatch'
]);

const DAY = 86400000;
// Firestore-like Timestamp (toMillis)
const TS = (ms) => ({ toMillis: () => ms });

function mundo({ domValue, dirs = [], empresas = {}, socios = [], planes = {} }) {
  const banner = { innerHTML: '' };
  const domEl = { value: domValue };
  const document = { getElementById: (id) => id==='dsp-area-banner' ? banner : (id==='dom' ? domEl : null) };
  const makeQuery = (coll, filters) => ({
    where: (f, op, v) => makeQuery(coll, filters.concat([[f, v]])),
    limit: () => makeQuery(coll, filters),
    get: async () => {
      const data = coll==='direcciones_protegidas' ? dirs : (coll==='socios' ? socios : []);
      const rows = data.filter(r => filters.every(([f, v]) => r[f] === v));
      return { empty: rows.length===0, docs: rows.map(r => ({ id: r._id||'x', data: () => r })) };
    }
  });
  const db = {
    collection: (coll) => ({
      where: (f, op, v) => makeQuery(coll, [[f, v]]),
      doc: (id) => ({ get: async () => {
        if (coll==='empresas') return { exists: !!empresas[id], data: () => empresas[id] };
        if (coll==='planes') return { exists: !!planes[id], data: () => planes[id] };
        return { exists:false, data: () => null };
      } })
    })
  };
  // firebase.firestore.Timestamp.now() usado por el camino persona (planSnapshot)
  const firebase = { firestore: { Timestamp: { now: () => TS(NOW) } } };
  return { db, document, banner, firebase, esc:(s)=>String(s==null?'':s), setTimeout:(fn)=>fn(), clearTimeout:()=>{}, console, Date: { now: () => NOW } };
}

let NOW = 1_700_000_000_000; // t0 fijo (no usamos Date.now real → reproducible)
let ok = 0, fail = 0;
const t = (b, label) => { b?ok++:fail++; console.log(`${b?'✓':'✗ FALLO'} ${label}`); };

function ctx(cfg) { const sb = mundo(cfg); vm.createContext(sb); sb.S = { callesPergamino: CALLES }; vm.runInContext(src, sb); return sb; }

(async () => {
  const AREA = (o={}) => Object.assign({ razonSocial:'Los Robles', tipo:'area_protegida', activo:true, vigenciaDesde:TS(NOW-10*DAY), vigenciaHasta:null }, o);
  const DIR = (o={}) => Object.assign({ _id:'d1', empresaId:'eA', calleId:'bartolome-mitre', altura:1234, activo:true }, o);

  // ---------- areaVigente (estricto) ----------
  {
    const sb = ctx({ domValue:'' });
    const V = (e) => vm.runInContext('areaVigente('+JSON.stringify(e)+', '+NOW+')', sb);
    // OJO: Timestamp con toMillis no serializa por JSON → uso millis planos (tsMsOf acepta number)
    t(V({ vigenciaDesde: NOW-DAY }) === true, 'areaVigente: desde en el pasado, sin hasta → cubre');
    t(V({ vigenciaDesde: NOW+DAY }) === false, 'areaVigente: desde en el futuro → NO cubre todavía');
    t(V({ vigenciaDesde: NOW-10*DAY, vigenciaHasta: NOW-DAY }) === false, 'areaVigente: hasta vencido → NO cubre');
    t(V({ vigenciaDesde: NOW-10*DAY, vigenciaHasta: NOW+DAY }) === true, 'areaVigente: dentro de [desde,hasta] → cubre');
    t(V({}) === false, 'areaVigente: SIN vigenciaDesde → NO cubre (estricto)');
    t(V({ vigenciaHasta: NOW+DAY }) === false, 'areaVigente: solo hasta, sin desde → NO cubre (estricto)');
  }

  // ---------- resolverAtribucionLugar ----------
  {
    const domCanon = { calleId:'bartolome-mitre', altura:1234 };
    const call = (sb) => vm.runInContext('resolverAtribucionLugar('+JSON.stringify(domCanon)+')', sb);
    // vigente → snapshot lugar con traza
    let sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA: { ...AREA(), vigenciaDesde: NOW-DAY } } });
    let r = await call(sb);
    t(r && r.tipo==='lugar' && r.empresaId==='eA' && r.dirId==='d1' && r.areaNombre==='Los Robles' && r.socioId===null, 'lugar vigente → snapshot {tipo:lugar, empresaId, dirId, areaNombre}');
    // sin vigencia → null (cae a persona)
    sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA: { razonSocial:'X', tipo:'area_protegida', activo:true } } });
    t((await call(sb)) === null, 'área SIN vigencia → null (cae a persona)');
    // empresa inactiva → null
    sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA: { ...AREA(), vigenciaDesde: NOW-DAY, activo:false } } });
    t((await call(sb)) === null, 'empresa inactiva → null');
    // sin calleId → null (rural)
    sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA: AREA() } });
    t((await vm.runInContext('resolverAtribucionLugar({calleId:null, altura:1234})', sb)) === null, 'calleId null (rural) → null');
    // no hay dirección → null
    sb = ctx({ domValue:'', dirs:[], empresas:{ eA: AREA() } });
    t((await call(sb)) === null, 'sin dirección protegida → null');
  }

  // ---------- resolverAtribucion: PRIORIDAD lugar, y caída a persona ----------
  {
    const domCanon = { calleId:'bartolome-mitre', altura:1234 };
    // persona ES socia con plan, PERO el episodio cae en área vigente → MANDA LUGAR
    let sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA:{ ...AREA(), vigenciaDesde:NOW-DAY } },
      socios:[{ _id:'s1', personaId:'p1', activo:true, planId:'pl1' }], planes:{ pl1:{ nombre:'Plan', coberturas:{ emergencias:true } } } });
    let r = await vm.runInContext("resolverAtribucion('p1', "+JSON.stringify(domCanon)+")", sb);
    t(r.tipo==='lugar' && r.empresaId==='eA', 'PRIORIDAD: socia con plan pero en área vigente → tipo lugar (manda el lugar)');
    // sin área vigente → cae a persona (socio+plan)
    sb = ctx({ domValue:'', dirs:[DIR()], empresas:{ eA:{ razonSocial:'X', tipo:'area_protegida', activo:true } }, // sin vigencia
      socios:[{ _id:'s1', personaId:'p1', activo:true, planId:'pl1' }], planes:{ pl1:{ nombre:'Plan', coberturas:{ emergencias:true } } } });
    r = await vm.runInContext("resolverAtribucion('p1', "+JSON.stringify(domCanon)+")", sb);
    t(r.tipo==='persona' && r.socioId==='s1' && r.planSnapshot && r.planSnapshot.nombre==='Plan', 'área sin vigencia → cae a persona (socio+plan intacto)');
    // sin domCanon (rural) → camino persona
    r = await vm.runInContext("resolverAtribucion('p1', null)", sb);
    t(r.tipo==='persona' && r.socioId==='s1', 'domCanon null → camino persona');
  }

  // ---------- banner 3 estados (dspAreaMatch) ----------
  {
    const mk = (dirs, empresas) => { const sb = mundo({ domValue:'Bartolomé Mitre 1234', dirs, empresas }); vm.createContext(sb); sb.S={callesPergamino:CALLES}; vm.runInContext(src, sb); return sb; };
    let sb = mk([DIR()], { eA:{ ...AREA(), vigenciaDesde:NOW-DAY } }); await vm.runInContext('dspAreaMatch()', sb);
    t(/cubierto por contrato/.test(sb.banner.innerHTML), 'banner: área vigente → verde "cubierto por contrato"');
    sb = mk([DIR()], { eA:{ razonSocial:'Los Robles', tipo:'area_protegida', activo:true } }); await vm.runInContext('dspAreaMatch()', sb);
    t(/SIN vigencia vigente/.test(sb.banner.innerHTML), 'banner: área sin vigencia → rojo "SIN vigencia → NO se cubre"');
    sb = mk([], {}); await vm.runInContext('dspAreaMatch()', sb);
    t(sb.banner.innerHTML==='', 'banner: sin área → vacío');
  }

  console.log(`\n${fail?'✗':'✓'} smoke-f3b-atribucion: ${ok} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
