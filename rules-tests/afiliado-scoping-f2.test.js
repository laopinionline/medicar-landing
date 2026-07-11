'use strict';
/*
 * Tests de reglas — F2: scoping del afiliado sobre socios (grupo familiar) y abonos.
 * Requiere el emulador de Firestore (Java).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/afiliado-scoping-f2.test.js"
 *
 * Cubre las 2 ramas nuevas:
 *   socios read + (titularPersonaId == miPersonaId)  → el TITULAR lee sus dependientes.
 *   abonos read + (personaId == miPersonaId)          → el AFILIADO lee SOLO sus abonos.
 * Foco de seguridad: nadie lee socios/abonos de otro; el dependiente no ve el grupo;
 * los roles internos siguen leyendo como hoy; sin personaId no se gana nada.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-scoping-f2';
let env;

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Usuarios: titular (persona pT), dependiente D1 (persona pD1), afiliado sin vínculo, despachante, admin.
    await db.doc('usuarios/titular').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pT' });
    await db.doc('usuarios/dep1').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pD1' });
    await db.doc('usuarios/suelto').set({ rol: 'afiliado', roles: ['afiliado'] }); // sin personaId
    await db.doc('usuarios/despa').set({ rol: 'despachante', roles: ['despachante'] });
    await db.doc('usuarios/adm').set({ rol: 'admin', roles: ['admin'] });
    await db.doc('usuarios/medico').set({ rol: 'medico', roles: ['medico'] });

    // Socios: titular T; dependiente D1 (titularPersonaId=pT); hermano D3 (mismo T); dependiente ajeno D2 (titularPersonaId=pOtro).
    await db.doc('socios/sT').set({ personaId: 'pT', numeroAfiliado: '20804', tipoAfiliado: 'directo', grupoTipo: 'familiar', activo: true });
    await db.doc('socios/sD1').set({ personaId: 'pD1', titularSocioId: 'sT', titularPersonaId: 'pT', nombreVista: 'DEP, Uno', numeroAfiliado: '20804-01', activo: true });
    await db.doc('socios/sD3').set({ personaId: 'pD3', titularSocioId: 'sT', titularPersonaId: 'pT', nombreVista: 'DEP, Tres', numeroAfiliado: '20804-02', activo: true });
    await db.doc('socios/sD2').set({ personaId: 'pD2', titularSocioId: 'sOtro', titularPersonaId: 'pOtro', nombreVista: 'AJENO, Dos', numeroAfiliado: '20900-01', activo: true });

    // Abonos: uno de T (personaId=pT), uno ajeno (personaId=pOtro).
    await db.doc('abonos/abT').set({ personaId: 'pT', socioId: 'sT', periodo: '2026-07', precioFinal: 20000, estado: 'generado' });
    await db.doc('abonos/abOtro').set({ personaId: 'pOtro', socioId: 'sOtro', periodo: '2026-07', precioFinal: 40000, estado: 'generado' });
  });
}

const ctx = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await seed(env);
});
after(async () => { if (env) await env.cleanup(); });

describe('F2 — scoping del afiliado (socios + abonos)', () => {

  it('1. titular LEE sus dependientes (query titularPersonaId == pT)', async () => {
    await assertSucceeds(ctx('titular').collection('socios').where('titularPersonaId', '==', 'pT').get());
  });
  it('2. titular NO lee un dependiente AJENO (otro titularPersonaId)', async () => {
    await assertFails(ctx('titular').doc('socios/sD2').get());
  });
  it('3a. dependiente NO lee a su TITULAR', async () => {
    await assertFails(ctx('dep1').doc('socios/sT').get());
  });
  it('3b. dependiente NO lee a un HERMANO (otro dependiente del mismo titular)', async () => {
    await assertFails(ctx('dep1').doc('socios/sD3').get());
  });
  it('3c. dependiente SÍ lee su propio socio (rama personaId, no rompe)', async () => {
    await assertSucceeds(ctx('dep1').doc('socios/sD1').get());
  });

  it('4. afiliado LEE SOLO sus abonos (query personaId == pT)', async () => {
    await assertSucceeds(ctx('titular').collection('abonos').where('personaId', '==', 'pT').get());
  });
  it('5. afiliado NO lee un abono AJENO', async () => {
    await assertFails(ctx('titular').doc('abonos/abOtro').get());
  });
  it('5b. afiliado NO puede querear TODOS los abonos (sin where propio)', async () => {
    await assertFails(ctx('titular').collection('abonos').get());
  });

  it('6a. despachante lee cualquier socio (interno, como hoy)', async () => {
    await assertSucceeds(ctx('despa').doc('socios/sD2').get());
  });
  it('6b. admin lee cualquier abono (interno, como hoy)', async () => {
    await assertSucceeds(ctx('adm').doc('abonos/abOtro').get());
  });
  it('6c. médico NO lee socios (scoping interno vigente: no gana lectura de padrón)', async () => {
    await assertFails(ctx('medico').doc('socios/sT').get());
  });

  it('7a. afiliado SIN personaId NO lee un socio ajeno', async () => {
    await assertFails(ctx('suelto').doc('socios/sT').get());
  });
  it('7b. afiliado SIN personaId NO lee abonos', async () => {
    await assertFails(ctx('suelto').doc('abonos/abT').get());
  });

  it('8. titular SÍ lee su propio socio (rama personaId vigente, no rota)', async () => {
    await assertSucceeds(ctx('titular').doc('socios/sT').get());
  });
});
