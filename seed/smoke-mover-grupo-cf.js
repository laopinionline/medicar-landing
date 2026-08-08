'use strict';
/* Smoke — CF moverDeGrupo: extrae el handler de functions/index.js y lo corre contra un Firestore FALSO (in-memory) para
 * ejercitar cada rama de la batería: mover OK · independizar OK · titular-con-deps · destino inexistente/inactivo/no-titular ·
 * mismo grupo · socio inactivo · sin cap · modo inválido · auditoría escrita. node seed/smoke-mover-grupo-cf.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8').split('\n');

// Extraer el handler: desde `exports.moverDeGrupo = onCall(` hasta su cierre por brace-match.
const start = S.findIndex(l => /exports\.moverDeGrupo = onCall\(/.test(l));
if (start < 0) throw new Error('no se encontró exports.moverDeGrupo');
let depth = 0, started = false, end = -1;
for (let i = start; i < S.length; i++) { for (const ch of S[i]) { if (ch === '(' || ch === '{') { depth++; started = true; } else if (ch === ')' || ch === '}') depth--; } if (started && depth === 0) { end = i; break; } }
const cfSrc = S.slice(start, end + 1).join('\n');

let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ── Firestore falso ──
function makeDB(store) {
  const ref = (coll, id) => ({
    async get() { const d = store[coll] && store[coll][id]; return { exists: !!d, id, data: () => d ? { ...d } : undefined }; },
    async set(update, opts) { if (!store[coll]) store[coll] = {}; const cur = store[coll][id] || {}; const m = (opts && opts.merge) ? { ...cur } : {}; for (const k of Object.keys(update)) { if (update[k] && update[k].__delete) delete m[k]; else m[k] = update[k]; } store[coll][id] = m; },
  });
  return { collection(coll) { return {
    doc(id) { return ref(coll, id); },
    where(field, _op, val) { return { async get() { const docs = Object.entries(store[coll] || {}).filter(([, d]) => d[field] === val).map(([id, d]) => ({ id, data: () => ({ ...d }) })); return { docs }; } }; },
    async add(obj) { store.auditoria = store.auditoria || []; store.auditoria.push(obj); return { id: 'aud' + store.auditoria.length }; },
  }; } };
}
function seedStore() {
  return {
    usuarios: { afiOK: { roles: ['despachante'], permisos: { gestionar_afiliados: true }, email: 'afi@x' }, sinCap: { roles: ['medico'] } },
    socios: {
      tit:  { personaId: 'pTit',  tipoAfiliado: 'directo', activo: true, planId: 'planFam' },
      tit2: { personaId: 'pTit2', tipoAfiliado: 'directo', activo: true, planId: 'planSen' },
      titInact: { personaId: 'pTI', tipoAfiliado: 'directo', activo: false, planId: 'planSen' },
      dep:  { personaId: 'pDep',  tipoAfiliado: 'directo', activo: true, planId: null, titularSocioId: 'tit', titularPersonaId: 'pTit' },
      depInact: { personaId: 'pDI', tipoAfiliado: 'directo', activo: false, titularSocioId: 'tit' },
    },
  };
}
function run(store, data, uid = 'afiOK') {
  const HttpsError = class extends Error { constructor(code, msg) { super(msg); this.code = code; } };
  const admin = { firestore: { FieldValue: { delete: () => ({ __delete: true }), serverTimestamp: () => 'TS' } } };
  const sandbox = { db: makeDB(store), FV: () => 'TS', admin, HttpsError, logger: { info() {}, warn() {} }, onCall: (fn) => fn, exports: {}, String, Array, Object };
  vm.createContext(sandbox);
  vm.runInContext(cfSrc, sandbox, { timeout: 3000 });
  return sandbox.exports.moverDeGrupo({ auth: { uid, token: { email: 'afi@x' } }, data });
}
const expectFail = async (label, store, data, code, uid) => { try { await run(store, data, uid); t(label + ' → debía rechazar', false); } catch (e) { t(`${label} → rechazo (${e.code})`, e.code === code); } };

(async () => {
  // 1) MOVER dependiente a otro grupo
  { const st = seedStore(); const r = await run(st, { socioId: 'dep', modo: 'grupo', titularDestinoId: 'tit2' });
    const d = st.socios.dep;
    t('mover: titularSocioId reescrito a tit2', d.titularSocioId === 'tit2');
    t('mover: titularPersonaId reescrito a pTit2', d.titularPersonaId === 'pTit2');
    t('mover: planId LIMPIADO (queda heredado del nuevo titular)', d.planId === null);
    t('mover: auditoría escrita (mover_de_grupo)', (st.auditoria || []).some(a => a.accion === 'mover_de_grupo' && a.refId === 'dep'));
    t('mover: ultimoMovimientoGrupo en el doc (grupo, origen→destino)', d.ultimoMovimientoGrupo && d.ultimoMovimientoGrupo.modo === 'grupo' && d.ultimoMovimientoGrupo.origenTitularSocioId === 'tit' && d.ultimoMovimientoGrupo.destinoTitularSocioId === 'tit2');
    t('mover: return ok', r && r.ok === true && r.modo === 'grupo'); }

  // 2) INDEPENDIZAR
  { const st = seedStore(); const r = await run(st, { socioId: 'dep', modo: 'independizar' });
    const d = st.socios.dep;
    t('independizar: titularSocioId limpiado (undefined)', d.titularSocioId === undefined);
    t('independizar: titularPersonaId limpiado (undefined)', d.titularPersonaId === undefined);
    t('independizar: plan COPIADO del titular (planFam)', d.planId === 'planFam');
    t('independizar: auditoría escrita (independizar_grupo)', (st.auditoria || []).some(a => a.accion === 'independizar_grupo'));
    t('independizar: return ok', r && r.ok === true && r.modo === 'independizar'); }

  // 3) Rechazos
  await expectFail('titular con dependientes', seedStore(), { socioId: 'tit', modo: 'independizar' }, 'failed-precondition');
  await expectFail('destino inexistente', seedStore(), { socioId: 'dep', modo: 'grupo', titularDestinoId: 'nope' }, 'not-found');
  await expectFail('destino inactivo', seedStore(), { socioId: 'dep', modo: 'grupo', titularDestinoId: 'titInact' }, 'failed-precondition');
  await expectFail('destino NO es titular (es dependiente)', seedStore(), { socioId: 'dep', modo: 'grupo', titularDestinoId: 'depInact' }, 'failed-precondition');
  await expectFail('mover al MISMO grupo', seedStore(), { socioId: 'dep', modo: 'grupo', titularDestinoId: 'tit' }, 'failed-precondition');
  await expectFail('socio inexistente', seedStore(), { socioId: 'ghost', modo: 'independizar' }, 'not-found');
  await expectFail('modo inválido', seedStore(), { socioId: 'dep', modo: 'xxx' }, 'invalid-argument');
  await expectFail('independizar un ya-independiente (titular)', seedStore(), { socioId: 'tit2', modo: 'independizar' }, 'failed-precondition');
  await expectFail('sin cap gestionar_afiliados', seedStore(), { socioId: 'dep', modo: 'independizar' }, 'permission-denied', 'sinCap');

  // socio inactivo: marco dep inactivo (sin deps activos)
  { const st = seedStore(); st.socios.dep.activo = false; await expectFail('socio inactivo', st, { socioId: 'dep', modo: 'independizar' }, 'failed-precondition'); }

  console.log(`\n${ok}/${ok + fail} checks OK`);
  process.exit(fail ? 1 : 0);
})();
