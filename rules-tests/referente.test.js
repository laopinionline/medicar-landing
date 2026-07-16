'use strict';
/*
 * Reglas — Referente R1. Las DOS CARAS de cada regla (quién SÍ / quién NO).
 * N3 innegociable: el referente lee estado_referido (derivado), JAMÁS reportes_sintomas (crudo).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/referente.test.js"
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const PROJECT = 'medicar-referente';
let env;
const ctx = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Actores:
//  titA (afiliado, personaId=pTitA) — genera/gestiona sus códigos
//  titB (afiliado, personaId=pTitB)
//  refX (referente): vínculo ACTIVO con pTitA; SIN vínculo con pTitB
//  refRev (referente): vínculo REVOCADO con pTitA
async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('usuarios/titA').set({ roles: ['afiliado'], personaId: 'pTitA' });
    await db.doc('usuarios/titB').set({ roles: ['afiliado'], personaId: 'pTitB' });
    // Espejos de vínculo (los escribe la CF por Admin SDK; acá se siembran)
    await db.doc('referentes/refX/titulares/pTitA').set({ estado: 'activo', habilitaciones: { estado: true }, codigo: 'MED-AAAAAA' });
    await db.doc('referentes/refRev/titulares/pTitA').set({ estado: 'revocado', habilitaciones: { estado: true }, codigo: 'MED-BBBBBB' });
    // Docs derivados N3 (los escribe la CF)
    await db.doc('estado_referido/pTitA').set({ ponderacion: 'con_sintomas', actualizadoEn: 1 });
    await db.doc('estado_referido/pTitB').set({ ponderacion: 'sin_sintomas', actualizadoEn: 1 });
    // Datos CRUDOS del titular (el referente NUNCA debe poder leerlos)
    await db.doc('reportes_sintomas/rep1').set({ personaId: 'pTitA', sintomas: [{ id: 's1', nombre: 'x', banderaRoja: true }], texto: 'crudo', tieneBanderaRoja: true, creadoEn: 1 });
    await db.doc('chequeos_parametros/chk1').set({ personaId: 'pTitA', fc: 120, news2Nivel: 'alto', creadoEn: 1 });
    await db.doc('socios/socA').set({ personaId: 'pTitA', numeroAfiliado: '90002', activo: true });
    await db.doc('facturas/facA').set({ personaId: 'pTitA', total: 1000 });
    // Feed "Para vos": el referente ve los PUBLICADOS (news de MEDICAR, no dato sensible); nunca pendientes.
    await db.doc('feed_posts/pub1').set({ estado: 'publicado', titulo: 'Nota publicada', cat: 'medicar' });
    await db.doc('feed_posts/pend1').set({ estado: 'pendiente', titulo: 'Borrador', cat: 'medicar' });
    // Un código pendiente de titA
    await db.doc('codigos_referente/MED-CCCCCC').set({ titularPersonaId: 'pTitA', estado: 'pendiente', habilitaciones: { estado: true }, referenteUid: null, creadoEn: 1 });
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

// El referente se autentica con claim rol:'referente' (las reglas NO dependen del claim, pero así es realista).
const REF = { rol: 'referente' };

describe('estado_referido — ponderación (la cara N3)', () => {
  it('✓ referente ACTIVO lee la ponderación de su titular habilitado', async () => {
    await assertSucceeds(ctx('refX', REF).doc('estado_referido/pTitA').get());
  });
  it('✗ referente NO lee la ponderación de un titular que NO lo habilitó', async () => {
    await assertFails(ctx('refX', REF).doc('estado_referido/pTitB').get());
  });
  it('✗ referente REVOCADO NO lee la ponderación (corte por REGLA, no UI)', async () => {
    await assertFails(ctx('refRev', REF).doc('estado_referido/pTitA').get());
  });
  it('✗ un anónimo NO lee la ponderación', async () => {
    await assertFails(anon().doc('estado_referido/pTitA').get());
  });
  it('✗ NADIE escribe estado_referido por reglas (solo la CF Admin SDK)', async () => {
    await assertFails(ctx('refX', REF).doc('estado_referido/pTitA').set({ ponderacion: 'sin_sintomas', actualizadoEn: 2 }));
    await assertFails(ctx('titA').doc('estado_referido/pTitA').set({ ponderacion: 'sin_sintomas', actualizadoEn: 2 }));
  });
});

describe('cuenta HUÉRFANA (canje falló tras crear cuenta) — benigna, NO lee NADA', () => {
  // Simula el borde "revocado entre validar y canjear": cuenta autenticada, claim referente, PERO sin ningún
  // vínculo (referentes/refHuerfano/titulares vacío). esReferenteActivoDe debe dar false para TODO.
  it('✗ huérfano NO lee estado_referido de NINGÚN titular (pTitA)', async () => {
    await assertFails(ctx('refHuerfano', REF).doc('estado_referido/pTitA').get());
  });
  it('✗ huérfano NO lee estado_referido de otro titular (pTitB)', async () => {
    await assertFails(ctx('refHuerfano', REF).doc('estado_referido/pTitB').get());
  });
  it('✗ huérfano NO lee reportes_sintomas/chequeos/socios/facturas', async () => {
    await assertFails(ctx('refHuerfano', REF).doc('reportes_sintomas/rep1').get());
    await assertFails(ctx('refHuerfano', REF).doc('chequeos_parametros/chk1').get());
    await assertFails(ctx('refHuerfano', REF).doc('socios/socA').get());
    await assertFails(ctx('refHuerfano', REF).doc('facturas/facA').get());
  });
  // (Leer su PROPIA subcolección de vínculos está permitido pero está VACÍA → no hay dato que obtener; no es leak.)
});

describe('feed "Para vos" — el referente lo lee, sin abrir de más', () => {
  it('✓ referente lee un feed_post PUBLICADO (news, no sensible)', async () => {
    await assertSucceeds(ctx('refX', REF).doc('feed_posts/pub1').get());
  });
  it('✓ hasta un referente HUÉRFANO (sin vínculos) lee el feed publicado (solo requiere estar autenticado)', async () => {
    await assertSucceeds(ctx('refHuerfano', REF).doc('feed_posts/pub1').get());
  });
  it('✗ NO se abrió de más: un NO autenticado NO lee el feed', async () => {
    await assertFails(anon().doc('feed_posts/pub1').get());
  });
  it('✗ NO se abrió de más: el referente NO lee un feed_post NO publicado (pendiente)', async () => {
    await assertFails(ctx('refX', REF).doc('feed_posts/pend1').get());
  });
});

describe('N3 — el referente JAMÁS lee el crudo del titular', () => {
  it('✗ referente NO lee reportes_sintomas (crudo)', async () => {
    await assertFails(ctx('refX', REF).doc('reportes_sintomas/rep1').get());
  });
  it('✗ referente NO lee chequeos_parametros (crudo)', async () => {
    await assertFails(ctx('refX', REF).doc('chequeos_parametros/chk1').get());
  });
  it('✗ referente NO lee socios del titular', async () => {
    await assertFails(ctx('refX', REF).doc('socios/socA').get());
  });
  it('✗ referente NO lee facturas del titular (plata)', async () => {
    await assertFails(ctx('refX', REF).doc('facturas/facA').get());
  });
});

describe('referentes/{uid}/titulares — el espejo del vínculo', () => {
  it('✓ el referente lee SUS propios vínculos (selector multi-titular)', async () => {
    await assertSucceeds(ctx('refX', REF).doc('referentes/refX/titulares/pTitA').get());
  });
  it('✗ un referente NO lee el vínculo de OTRO referente', async () => {
    await assertFails(ctx('refRev', REF).doc('referentes/refX/titulares/pTitA').get());
  });
  it('✗ el referente NO escribe su vínculo (solo la CF)', async () => {
    await assertFails(ctx('refX', REF).doc('referentes/refX/titulares/pTitA').set({ estado: 'activo', habilitaciones: { estado: true } }));
  });
});

describe('codigos_referente — el titular genera/gestiona', () => {
  it('✓ el titular crea un código para SÍ mismo', async () => {
    await assertSucceeds(ctx('titA').doc('codigos_referente/MED-DDDDDD').set({ titularPersonaId: 'pTitA', estado: 'pendiente', habilitaciones: { estado: true }, referenteUid: null, nombreReferente: 'Hijo', creadoEn: 1, canjeadoEn: null, revocadoEn: null, expiraEn: 1 }));
  });
  it('✗ un socio NO crea un código para OTRA personaId', async () => {
    await assertFails(ctx('titB').doc('codigos_referente/MED-EEEEEE').set({ titularPersonaId: 'pTitA', estado: 'pendiente', habilitaciones: { estado: true }, referenteUid: null, creadoEn: 1 }));
  });
  it('✓ el titular lee su propio código', async () => {
    await assertSucceeds(ctx('titA').doc('codigos_referente/MED-CCCCCC').get());
  });
  it('✗ otro socio NO lee el código ajeno', async () => {
    await assertFails(ctx('titB').doc('codigos_referente/MED-CCCCCC').get());
  });
  it('✓ el titular revoca su código (estado->revocado)', async () => {
    await assertSucceeds(ctx('titA').doc('codigos_referente/MED-CCCCCC').set({ estado: 'revocado', revocadoEn: 2 }, { merge: true }));
  });
  it('✗ el titular NO puede pisar otros campos del código (solo estado/revocadoEn)', async () => {
    await assertFails(ctx('titA').doc('codigos_referente/MED-CCCCCC').set({ titularPersonaId: 'pTitB' }, { merge: true }));
  });
});
