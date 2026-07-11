'use strict';
/*
 * Tests de reglas — Tramo 5c "Mi plan" del afiliado (lectura read-only del modelo real).
 * Requiere el emulador de Firestore (Java).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/miplan-5c.test.js"
 *
 * Foco: plan()/planLoad() SOLO hacen las lecturas que las reglas ya permiten al afiliado
 *  (su propio socio + el plan del catálogo) y NADA más. Confirma que la decisión D1-D5=(a)
 *  no requiere reglas nuevas y que el afiliado no ve datos de otros ni data financiera.
 *  Incluye la lógica pura de display (precio base / "desde $X", tipo, selección de socio activo).
 */
const assert = require('assert');
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-miplan-5c';
let env;

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // afiliado puro vinculado a la persona pA
    await db.doc('usuarios/afil').set({ rol: 'afiliado', roles: ['afiliado'], personaId: 'pA' });
    // socio propio (mismo personaId) + socio ajeno + plan del catálogo + abono (financiero) + prestación (interno)
    await db.doc('socios/sMio').set({ personaId: 'pA', planId: 'plan1', activo: true, numeroAfiliado: '20791', tipoAfiliado: 'directo' });
    await db.doc('socios/sOtro').set({ personaId: 'pX', planId: 'plan1', activo: true, numeroAfiliado: '20800', tipoAfiliado: 'directo' });
    await db.doc('planes/plan1').set({ nombre: 'Plan 01', descripcion: 'Cobertura integral', precio: 55000, modeloPrecio: 'por_integrante', carenciaDias: 30, activo: true });
    await db.doc('abonos/ab1').set({ socioId: 'sMio', periodo: '2026-07', precioFinal: 55000 });
    await db.doc('prestaciones/p1').set({ nombre: 'Emergencias', activo: true });
  });
}

const ctx = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await seed(env);
});
after(async () => { if (env) await env.cleanup(); });

describe('Tramo 5c — "Mi plan" del afiliado: lecturas que hace la vista', () => {

  it('planLoad: el afiliado LEE sus socios (query where personaId == el suyo)', async () => {
    await assertSucceeds(ctx('afil').collection('socios').where('personaId', '==', 'pA').get());
  });
  it('planLoad: el afiliado NO lee un socio AJENO (otro personaId)', async () => {
    await assertFails(ctx('afil').doc('socios/sOtro').get());
  });
  it('planLoad: query de socios SIN el where propio (todo el padrón) es RECHAZADA', async () => {
    await assertFails(ctx('afil').collection('socios').get());
  });
  it('planLoad: el afiliado LEE el plan del catálogo (read: isSignedIn)', async () => {
    await assertSucceeds(ctx('afil').doc('planes/plan1').get());
  });

  // La vista 5c (D5=a) NO toca abonos ni (D3=a) prestaciones: se confirma que además NO puede.
  it('el afiliado NO lee abonos (data financiera cerrada — por eso no hay "próximo débito")', async () => {
    await assertFails(ctx('afil').doc('abonos/ab1').get());
  });
  it('el afiliado NO lee prestaciones (por eso no se muestran coberturas reales por nombre)', async () => {
    await assertFails(ctx('afil').doc('prestaciones/p1').get());
  });
});

// ── Lógica pura de display (réplica de las funciones nuevas de plan()) ──
function planTipoLbl(t) { return t === 'corporativo' ? 'Corporativo' : (t === 'directo' ? 'Directo' : (t || '—')); }
function precioStr(pl) {
  const base = Number(pl.precio) || 0;
  return (pl.modeloPrecio === 'por_integrante') ? ('desde $' + base.toLocaleString('es-AR')) : ('$' + base.toLocaleString('es-AR'));
}
function elegirSocio(socios) { return socios.find(s => s.activo !== false) || socios[0] || null; }
// "Qué incluye": réplica de la selección itemsLanding → lista vs fallback de plan().
function coberturaItems(pl) { return (pl && Array.isArray(pl.itemsLanding)) ? pl.itemsLanding.map(x => String(x || '').trim()).filter(Boolean) : []; }

describe('Tramo 5c — lógica pura de la tarjeta', () => {
  it('precio por_integrante → "desde $…"', () => {
    const s = precioStr({ precio: 55000, modeloPrecio: 'por_integrante' });
    assert.ok(s.startsWith('desde $') && s.includes('55'), s);
  });
  it('precio fijo → "$…" sin "desde"', () => {
    const s = precioStr({ precio: 55000, modeloPrecio: 'fijo' });
    assert.ok(s.startsWith('$') && !s.includes('desde') && s.includes('55'), s);
  });
  it('tipo: directo/corporativo/otro', () => {
    assert.strictEqual(planTipoLbl('directo'), 'Directo');
    assert.strictEqual(planTipoLbl('corporativo'), 'Corporativo');
    assert.strictEqual(planTipoLbl(undefined), '—');
  });
  it('selección de socio: prefiere el ACTIVO aunque venga después', () => {
    const s = elegirSocio([{ id: 'x', activo: false }, { id: 'y', activo: true }]);
    assert.strictEqual(s.id, 'y');
  });
  it('selección de socio: si ninguno activo, cae al primero (no null)', () => {
    const s = elegirSocio([{ id: 'x', activo: false }]);
    assert.strictEqual(s.id, 'x');
  });

  it('coberturas: con itemsLanding → lista curada (limpia vacíos/espacios)', () => {
    const items = coberturaItems({ itemsLanding: ['Atención 24hs', '  ', 'Traslados', ''] });
    assert.deepStrictEqual(items, ['Atención 24hs', 'Traslados']);
  });
  it('coberturas: sin itemsLanding (ausente/no-array/vacío) → fallback (lista vacía)', () => {
    assert.strictEqual(coberturaItems({}).length, 0);
    assert.strictEqual(coberturaItems({ itemsLanding: [] }).length, 0);
    assert.strictEqual(coberturaItems({ itemsLanding: ['  ', ''] }).length, 0);
    assert.strictEqual(coberturaItems({ itemsLanding: 'no-array' }).length, 0);
  });
});
