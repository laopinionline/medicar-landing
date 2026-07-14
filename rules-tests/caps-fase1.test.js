'use strict';
/*
 * Tests de reglas — TABLERO DE HABILIDADES, FASE 1: caps partidas + bypass de rol REMOVIDO.
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/caps-fase1.test.js"
 *
 * Matriz por rol/cap. Verifica el CORAZÓN del tramo: toda cap se resuelve por permisos[cap], SIN atajo isAdmin().
 *  - EL TEST QUE NO PUEDE FALTAR: un admin SIN configurar_sistema NO escribe planes.
 *  - Splits reales: facturar≠configurar_sistema, clinico≠configurar_sistema, marketing≠gestionar_afiliados.
 *  - curar_novedades como cap (antes rol admin).
 *  - Superadmin sigue pudiendo todo (cortocircuito de tienePermiso).
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const PROJECT = 'medicar-caps-fase1';
let env;

const ADMIN_PRESET = { configurar_sistema:true, facturar:true, clinico:true, gestionar_afiliados:true, marketing:true, gestionar_cobranza:true, gestionar_personal:true, curar_novedades:true };
const FACT = (o={}) => Object.assign({ periodo:'2099-01', personaId:'pA', socioId:'s1', nombre:'X', numeroAfiliado:'100', items:[{tipo:'abono',refId:'ab1',descripcion:'d',monto:1000}], total:1000, estado:'emitida', emitidaEn:1, emitidaPor:'x', nroComprobante:'FC-2099-000001' }, o);
const PAGO = (o={}) => Object.assign({ pagadorId:'pA', pagadorTipo:'persona', facturaId:'f1', personaId:'pA', monto:500, fecha:'2099-01-01', medio:'efectivo', reciboNro:'RC-2099-000001', nota:'', estado:'registrado', registradoEn:1, registradoPor:'x' }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/super').set({ rol:'superadmin', roles:['superadmin'] });
    await db.doc('usuarios/admGeneral').set({ rol:'admin', roles:['admin'], permisos: ADMIN_PRESET });                 // admin post-migración
    await db.doc('usuarios/admSinConfig').set({ rol:'admin', roles:['admin'], permisos: { gestionar_afiliados:true } }); // admin RECORTADO (sin configurar_sistema)
    await db.doc('usuarios/fact').set({ rol:'despachante', roles:['despachante'], permisos: { facturar:true } });
    await db.doc('usuarios/clin').set({ rol:'despachante', roles:['despachante'], permisos: { clinico:true } });
    await db.doc('usuarios/mkt').set({ rol:'despachante', roles:['despachante'], permisos: { marketing:true } });
    await db.doc('usuarios/afi').set({ rol:'despachante', roles:['despachante'], permisos: { gestionar_afiliados:true } });
    await db.doc('usuarios/cob').set({ rol:'despachante', roles:['despachante'], permisos: { gestionar_cobranza:true } });
    await db.doc('usuarios/cur').set({ rol:'despachante', roles:['despachante'], permisos: { curar_novedades:true } });
    await db.doc('usuarios/gp').set({ rol:'despachante', roles:['despachante'], permisos: { gestionar_personal:true } });
    await db.doc('usuarios/med1').set({ rol:'medico', roles:['medico'] });
    await db.doc('usuarios/cont').set({ rol:'contable', roles:['contable'], permisos: { facturar:true, gestionar_cobranza:true } }); // Fase2: rol contable
    await db.doc('usuarios/plano').set({ rol:'despachante', roles:['despachante'] }); // operativo SIN caps
    await db.doc('staff_medico/med1').set({ nombre:'Dr X', activo:true });
    // fixtures para los reads del contable (Fase2)
    await db.doc('socios/s1').set({ numeroAfiliado:'100', activo:true });
    await db.doc('episodios/e1').set({ estado:'cerrado' });
    await db.doc('empresas/emp1').set({ razonSocial:'ACME' });
    await db.doc('personas/pA').set({ nombre:'X' });
    await db.doc('contadores/facturas').set({ ultimo:5 });
    await db.doc('tarifas/t1').set({ nombre:'T', activo:true });
    await db.doc('prestaciones/pr1').set({ nombre:'Emergencias', activo:true });
    await db.doc('respuestas_cuestionario/r1').set({ personaId:'pZ', creadoEn:1 });
    // fixtures de lectura
    await db.doc('feed_posts/fPend').set({ estado:'pendiente', origen:'interno', titulo:'P' });
    await db.doc('auditoria/a1').set({ accion:'x', en:1 });
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('★ EL TEST QUE NO PUEDE FALTAR — bypass isAdmin removido', () => {
  it('✗ admin SIN configurar_sistema NO escribe planes', async () => { await assertFails(ctx('admSinConfig').doc('planes/pN').set({ nombre:'Plan', activo:true })); });
  it('✓ admin CON configurar_sistema escribe planes', async () => { await assertSucceeds(ctx('admGeneral').doc('planes/pN').set({ nombre:'Plan', activo:true })); });
  it('✓ superadmin escribe planes (cortocircuito)', async () => { await assertSucceeds(ctx('super').doc('planes/pN').set({ nombre:'Plan', activo:true })); });
  it('✗ operativo pelado NO escribe planes', async () => { await assertFails(ctx('plano').doc('planes/pN').set({ nombre:'Plan', activo:true })); });
});

describe('configurar_sistema (residual: comercial + auditoría)', () => {
  it('✓ configurar_sistema crea prestacion', async () => { await assertSucceeds(ctx('admGeneral').doc('prestaciones/x').set({ nombre:'Emergencias', activo:true })); });
  it('✗ facturar NO escribe tarifas', async () => { await assertFails(ctx('fact').doc('tarifas/t9').set({ nombre:'T', activo:true })); });
  it('✓ configurar_sistema lee auditoría', async () => { await assertSucceeds(ctx('admGeneral').doc('auditoria/a1').get()); });
  it('✗ admin recortado NO lee auditoría', async () => { await assertFails(ctx('admSinConfig').doc('auditoria/a1').get()); });
});

describe('facturar (split de configurar_sistema)', () => {
  it('✓ facturar crea factura válida', async () => { await assertSucceeds(ctx('fact').doc('facturas/fN').set(FACT())); });
  it('✗ configurar_sistema-only NO factura (facturar es cap propia)', async () => { await assertFails(ctx('admSinConfig').doc('facturas/fN').set(FACT())); });
  it('✗ facturar NO crea pago (facturar ≠ cobranza)', async () => { await assertFails(ctx('fact').collection('pagos').add(PAGO())); });
});

describe('clinico (catálogo clínico + monitoreo, JUNTOS)', () => {
  it('✓ clinico escribe sintomas_catalogo', async () => { await assertSucceeds(ctx('clin').doc('sintomas_catalogo/s9').set({ nombre:'Dolor', banderaRoja:true, activo:true })); });
  it('✓ clinico escribe cuestionarios', async () => { await assertSucceeds(ctx('clin').doc('cuestionarios/c9').set({ nombre:'Q', activo:true })); });
  it('✗ clinico NO escribe planes (no es configurar_sistema)', async () => { await assertFails(ctx('clin').doc('planes/pN').set({ nombre:'P' })); });
  it('✗ configurar_sistema NO escribe sintomas (clinico es cap propia)', async () => { await assertFails(ctx('admSinConfig').doc('sintomas_catalogo/s9').set({ nombre:'X', banderaRoja:false, activo:true })); });
});

describe('marketing (split de gestionar_afiliados)', () => {
  it('✓ marketing escribe leads', async () => { await assertSucceeds(ctx('mkt').doc('leads/l9').set({ nombre:'Lead', estado:'nuevo' })); });
  it('✓ marketing escribe campanas', async () => { await assertSucceeds(ctx('mkt').doc('campanas/k9').set({ nombre:'Camp', activo:true })); });
  it('✗ gestionar_afiliados NO escribe leads (marketing separado)', async () => { await assertFails(ctx('afi').doc('leads/l9').set({ nombre:'Lead' })); });
  it('✗ marketing NO escribe personas (padrón separado)', async () => { await assertFails(ctx('mkt').doc('personas/pX').set({ nombre:'X' })); });
});

describe('gestionar_afiliados (padrón, sin marketing)', () => {
  it('✓ gestionar_afiliados escribe personas', async () => { await assertSucceeds(ctx('afi').doc('personas/pX').set({ nombre:'X' })); });
  it('✓ gestionar_afiliados crea socio', async () => { await assertSucceeds(ctx('afi').doc('socios/sX').set({ numeroAfiliado:'9', activo:true })); });
});

describe('gestionar_cobranza', () => {
  it('✓ cobranza crea pago válido', async () => { await assertSucceeds(ctx('cob').collection('pagos').add(PAGO())); });
  it('✗ cobranza NO factura (cobrar ≠ facturar)', async () => { await assertFails(ctx('cob').doc('facturas/fN').set(FACT())); });
});

describe('gestionar_personal (staff + staff_medico, sin bypass isAdmin)', () => {
  it('✓ gestionar_personal crea staff_medico', async () => { await assertSucceeds(ctx('gp').doc('staff_medico/m9').set({ nombre:'Dr Y', activo:true })); });
  it('✗ admin sin gestionar_personal NO crea staff_medico', async () => { await assertFails(ctx('admSinConfig').doc('staff_medico/m9').set({ nombre:'Dr Y', activo:true })); });
  it('✓ gestionar_personal escribe staff', async () => { await assertSucceeds(ctx('gp').doc('staff/s9').set({ personaId:'s9', rol:'medico', activo:true })); });
  it('✓ el médico actualiza SU propio nombre en staff_medico', async () => { await assertSucceeds(ctx('med1').doc('staff_medico/med1').set({ nombre:'Dr X2' }, { merge:true })); });
  it('✗ operativo pelado NO crea staff_medico', async () => { await assertFails(ctx('plano').doc('staff_medico/m9').set({ nombre:'Z', activo:true })); });
});

describe('Fase2 — reads del contable (cap-driven, sin datos de salud ni tarifas)', () => {
  it('✓ contable lee socios (deuda por socio; sin datos clínicos)', async () => { await assertSucceeds(ctx('cont').doc('socios/s1').get()); });
  it('✗ contable NO lee episodios (motivo/triage/examen/desenlace clínicos)', async () => { await assertFails(ctx('cont').doc('episodios/e1').get()); });
  it('✓ contable lee empresas (facturar/cobrar a empresa)', async () => { await assertSucceeds(ctx('cont').doc('empresas/emp1').get()); });
  it('✗ contable NO lee personas (antecedentesCronicos/Otros clínicos)', async () => { await assertFails(ctx('cont').doc('personas/pA').get()); });
  it('✓ contable lee e incrementa contador FC-/RC-', async () => { await assertSucceeds(ctx('cont').doc('contadores/facturas').get()); await assertSucceeds(ctx('cont').doc('contadores/facturas').set({ ultimo:6, actualizadoEn:2 }, { merge:true })); });
  it('✓ contable crea factura y pago', async () => { await assertSucceeds(ctx('cont').doc('facturas/fC').set(FACT())); await assertSucceeds(ctx('cont').collection('pagos').add(PAGO())); });
  it('✗ contable NO lee tarifas (NO ve tarifas — J4)', async () => { await assertFails(ctx('cont').doc('tarifas/t1').get()); });
  it('✗ contable NO lee prestaciones', async () => { await assertFails(ctx('cont').doc('prestaciones/pr1').get()); });
  it('✗ contable NO lee datos de salud (respuestas_cuestionario)', async () => { await assertFails(ctx('cont').doc('respuestas_cuestionario/r1').get()); });
  it('✗ contable NO escribe planes/sintomas/leads (no tiene esas caps)', async () => { await assertFails(ctx('cont').doc('planes/pX').set({ nombre:'P' })); await assertFails(ctx('cont').doc('sintomas_catalogo/sX').set({ nombre:'S', banderaRoja:false, activo:true })); await assertFails(ctx('cont').doc('leads/lX').set({ nombre:'L' })); });
});

describe('curar_novedades (antes rol admin, ahora cap)', () => {
  it('✓ curador lee pendiente', async () => { await assertSucceeds(ctx('cur').doc('feed_posts/fPend').get()); });
  it('✓ curador crea publicado', async () => { await assertSucceeds(ctx('cur').doc('feed_posts/fN').set({ estado:'publicado', origen:'interno', titulo:'M' })); });
  it('✗ admin sin curar_novedades NO lee pendiente', async () => { await assertFails(ctx('admSinConfig').doc('feed_posts/fPend').get()); });
  it('✗ operativo pelado NO lee pendiente', async () => { await assertFails(ctx('plano').doc('feed_posts/fPend').get()); });
});
