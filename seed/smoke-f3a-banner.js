// Smoke F3a — banner de Área Protegida en el despacho. EJECUTA dspAreaMatch (extraída por nombre) con db/document
// mockeados. Casos: match (muestra) · no-match (vacío) · calleId null/rural (vacío, sin query) · empresa inactiva
// (vacío) · área declarada con "Bartolomé Mitre" y episodio tipeado "Mitre" (alias → matchea igual).
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { lines, fns, konst } = require('./lib/extract');
const L = lines('app/index.html');

const CALLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'calles-pergamino.json'), 'utf8'));
const src = konst(L, 'CALLE_ALIAS') + '\n' +
  fns(L, ['geoStripAccents','geoNormStreet','normalizarDireccion','calleSlug','callesIndex','resolverCalleId','calleCanon',
          'tsMsOf','areaVigente','dspDomChange','dspAreaSet','dspAreaKey','dspAreaMatch']); // F3b sumó vigencia al banner

// --- fábrica de un mundo mockeado: domicilio tipeado + data de direcciones/empresas ---
function mundo({ domValue, dirs=[], empresas={} }) {
  const banner = { innerHTML: '' };
  const domEl = { value: domValue };
  const document = { getElementById: (id) => id==='dsp-area-banner' ? banner : (id==='dom' ? domEl : null) };

  // query encadenado where().where().where().limit().get() con filtros de igualdad
  const makeQuery = (coll, filters) => ({
    where: (f, op, v) => makeQuery(coll, filters.concat([[f, v]])),
    limit: () => makeQuery(coll, filters),
    get: async () => {
      const rows = (coll==='direcciones_protegidas' ? dirs : [])
        .filter(r => filters.every(([f, v]) => r[f] === v));
      return { docs: rows.map(r => ({ data: () => r })) };
    }
  });
  const db = {
    collection: (coll) => ({
      where: (f, op, v) => makeQuery(coll, [[f, v]]),
      doc: (id) => ({ get: async () => ({ exists: !!empresas[id], data: () => empresas[id] }) })
    })
  };
  return { db, document, banner, domEl, esc:(s)=>String(s==null?'':s), setTimeout:(fn)=>fn(), clearTimeout:()=>{}, console };
}

async function run(label, cfg, expect) {
  const sb = mundo(cfg);
  vm.createContext(sb);
  sb.S = { callesPergamino: CALLES };
  vm.runInContext(src, sb);
  await vm.runInContext('dspAreaMatch()', sb); // ejecuta el match real
  const html = sb.banner.innerHTML;
  const shown = /Área Protegida/.test(html);
  const nameOk = expect.name ? html.includes(expect.name) : true;
  const ok = (shown === expect.shown) && nameOk;
  console.log(`${ok?'✓':'✗ FALLO'} ${label} → banner=${shown?('"'+html.replace(/<[^>]+>/g,'').trim()+'"'):'(vacío)'}`);
  return ok;
}

(async () => {
  let ok = 0, fail = 0; const t = b => b ? ok++ : fail++;
  const AREA = { razonSocial:'Barrio Los Robles', tipo:'area_protegida', activo:true, vigenciaDesde:1 }; // F3b: vigencia requerida (estricto) para que el banner muestre "cubierto"
  const DIR = (o={}) => Object.assign({ empresaId:'eA', calleId:'bartolome-mitre', altura:1234, activo:true }, o);

  // 1. MATCH: "Bartolomé Mitre 1234" → dir activa + área activa → muestra
  t(await run('match directo (Bartolomé Mitre 1234)',
    { domValue:'Bartolomé Mitre 1234', dirs:[DIR()], empresas:{ eA:AREA } },
    { shown:true, name:'Barrio Los Robles' }));

  // 2. ALIAS: área declarada como bartolome-mitre; despachante tipea "Mitre 1234" → alias → matchea
  t(await run('alias (episodio "Mitre 1234" ↔ dir bartolome-mitre)',
    { domValue:'Mitre 1234', dirs:[DIR()], empresas:{ eA:AREA } },
    { shown:true, name:'Barrio Los Robles' }));

  // 3. NO-MATCH: calle resuelve pero no hay dirección protegida en esa altura
  t(await run('no-match (misma calle, otra altura)',
    { domValue:'Mitre 9999', dirs:[DIR({ altura:1234 })], empresas:{ eA:AREA } },
    { shown:false }));

  // 4. calleId NULL (rural): no query, banner vacío
  t(await run('rural / calleId null (Camino Rural Km 7 100)',
    { domValue:'Camino Rural Km 7 100', dirs:[DIR({ calleId:null })], empresas:{ eA:AREA } },
    { shown:false }));

  // 5. EMPRESA INACTIVA: dir activa pero el área está inactiva → no muestra
  t(await run('empresa inactiva → no muestra',
    { domValue:'Bartolomé Mitre 1234', dirs:[DIR()], empresas:{ eA:{ ...AREA, activo:false } } },
    { shown:false }));

  // 6. DIRECCIÓN dada de baja (activo:false) → el where(activo==true) la excluye
  t(await run('dirección activo:false → no muestra',
    { domValue:'Bartolomé Mitre 1234', dirs:[DIR({ activo:false })], empresas:{ eA:AREA } },
    { shown:false }));

  // 7. empresa NO es area_protegida (corporativa) → no muestra
  t(await run('empresa corporativa (no área) → no muestra',
    { domValue:'Bartolomé Mitre 1234', dirs:[DIR()], empresas:{ eA:{ razonSocial:'ACME', tipo:'corporativo', activo:true } } },
    { shown:false }));

  console.log(`\n${fail?'✗':'✓'} smoke-f3a-banner: ${ok} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
