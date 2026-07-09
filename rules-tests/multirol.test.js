'use strict';
/*
 * Tests de reglas — Multi-rol Tramo 1 (matriz mínima).
 * Requiere el emulador de Firestore corriendo (necesita Java).
 *
 *   npm i -D @firebase/rules-unit-testing firebase-tools mocha
 *   npx firebase emulators:exec --only firestore "npx mocha rules-tests/multirol.test.js"
 *
 * Cubre: afiliado puro / medico / multi-rol [medico,afiliado] / doc viejo (solo rol).
 * Foco de seguridad: un afiliado puro NO lee clínica ajena ni gana caps; el multi-rol
 * mantiene EXACTAMENTE la unión; el doc viejo (sin roles[]) funciona por fallback.
 */
const assert = require('assert');
const fs = require('fs');
const {
  initializeTestEnvironment, assertFails, assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-rules-test';
let env;

// Siembra docs directo (bypass de reglas) para preparar el estado.
async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // usuarios: multi-rol (roles[]) y docs viejos (solo rol) para probar el fallback.
    await db.doc('usuarios/afil').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    await db.doc('usuarios/med').set({ rol: 'medico', roles: ['medico'], personaId: 'pM' });
    await db.doc('usuarios/medafil').set({ rol: 'medico', roles: ['medico', 'afiliado'], personaId: 'pMA' });
    await db.doc('usuarios/viejoMed').set({ rol: 'medico' });           // sin roles[] -> fallback
    await db.doc('usuarios/viejoAfil').set({ rol: 'afiliado', personaId: 'pV' }); // sin roles[] -> fallback
    // clínica (respuestas_cuestionario) colgada de personaId
    await db.doc('respuestas_cuestionario/rOtro').set({ personaId: 'pX', cuestionarioId: 'c1' }); // de otra persona
    await db.doc('respuestas_cuestionario/rMio').set({ personaId: 'pA', cuestionarioId: 'c1' });  // del afiliado afil
    // catálogo interno
    await db.doc('prestaciones/p1').set({ nombre: 'Emergencias', activo: true });
  });
}

const ctx = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
  await seed(env);
});
after(async () => { if (env) await env.cleanup(); });

describe('Multi-rol Tramo 1 — matriz de reglas', () => {

  it('afiliado puro NO lee clínica ajena', async () => {
    await assertFails(ctx('afil').doc('respuestas_cuestionario/rOtro').get());
  });
  it('afiliado puro SÍ lee su propia clínica (personaId == miPersonaId)', async () => {
    await assertSucceeds(ctx('afil').doc('respuestas_cuestionario/rMio').get());
  });
  it('afiliado puro NO gana caps internos (no lee catálogo interno)', async () => {
    await assertFails(ctx('afil').doc('prestaciones/p1').get());
  });
  it('afiliado puro NO lee usuarios ajenos', async () => {
    await assertFails(ctx('afil').doc('usuarios/med').get());
  });

  it('médico lee clínica ajena (esInterno)', async () => {
    await assertSucceeds(ctx('med').doc('respuestas_cuestionario/rOtro').get());
  });
  it('médico lee catálogo interno', async () => {
    await assertSucceeds(ctx('med').doc('prestaciones/p1').get());
  });

  it('multi-rol [medico,afiliado] mantiene la UNIÓN: lee clínica (médico)', async () => {
    await assertSucceeds(ctx('medafil').doc('respuestas_cuestionario/rOtro').get());
  });
  it('multi-rol [medico,afiliado] es interno (catálogo)', async () => {
    await assertSucceeds(ctx('medafil').doc('prestaciones/p1').get());
  });

  it('doc VIEJO (solo rol=medico, sin roles[]) sigue leyendo clínica (fallback)', async () => {
    await assertSucceeds(ctx('viejoMed').doc('respuestas_cuestionario/rOtro').get());
  });
  it('doc VIEJO (solo rol=afiliado, sin roles[]) NO lee clínica ajena (fallback)', async () => {
    await assertFails(ctx('viejoAfil').doc('respuestas_cuestionario/rOtro').get());
  });
});
