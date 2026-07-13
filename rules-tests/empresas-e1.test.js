'use strict';
/*
 * Tests de reglas — E-1: facturación a empresas (socios.facturarA + empresas.convenio + facturas polimórficas).
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "npx mocha rules-tests/empresas-e1.test.js"
 *
 * Blindado desde el nacimiento (F-1/C-1): facturarA validado si presente, convenio con forma estricta,
 * empresas con hasOnly del shape completo (numeroConvenio/tipo/creadoEn inmutables), factura cliente polimórfico.
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const PROJECT = 'medicar-empresas-e1';
let env;

const EMP = (o={}) => Object.assign({ razonSocial:'ACME', cuit:'20-1', contacto:'c', telefono:'t', email:'e', tipo:'corporativo', planIdDefault:null, activo:true, creadoEn:1, numeroConvenio:'30703', ultimoSufijo:0 }, o);
const SOC = (o={}) => Object.assign({ personaId:'pA', tipoAfiliado:'directo', activo:true, numeroAfiliado:'100' }, o);
const FACT_PER = (o={}) => Object.assign({ periodo:'2099-01', personaId:'pA', socioId:'s1', nombre:'X', numeroAfiliado:'100', items:[{tipo:'abono',refId:'ab1',descripcion:'d',monto:1000}], total:1000, estado:'emitida', emitidaEn:1, emitidaPor:'cfg', nroComprobante:'FC-2099-000001' }, o);
const FACT_EMP = (o={}) => Object.assign({ periodo:'2099-01', nombre:'ACME', items:[{descripcion:'convenio',monto:1000}], total:1000, estado:'emitida', emitidaEn:1, emitidaPor:'cfg', nroComprobante:'FC-2099-000002', clienteTipo:'empresa', clienteId:'eA', clienteNombre:'ACME' }, o);

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/adm').set({ rol:'admin', roles:['admin'] });
    await db.doc('usuarios/afi').set({ rol:'despachante', roles:['despachante'], permisos:{ gestionar_afiliados:true } });
    await db.doc('usuarios/cfg').set({ rol:'despachante', roles:['despachante'], permisos:{ configurar_sistema:true } });
    await db.doc('usuarios/oper').set({ rol:'despachante', roles:['despachante'] });
    await db.doc('usuarios/socioU').set({ rol:'afiliado', roles:['afiliado'], personaId:'pA' });
    await db.doc('socios/sA').set(SOC());
    await db.doc('empresas/eA').set(EMP());
  });
}
const ctx = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); await seed(env); });
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await seed(env); });

describe('E-1 — SOCIOS.facturarA (forma)', () => {
  it('✓ afiliados-mgr set facturarA persona',       async () => { await assertSucceeds(ctx('afi').doc('socios/sA').set({ facturarA:{ tipo:'persona' } }, { merge:true })); });
  it('✓ afiliados-mgr set facturarA empresa OK',    async () => { await assertSucceeds(ctx('afi').doc('socios/sA').set({ facturarA:{ tipo:'empresa', empresaId:'eA', razonSocial:'ACME' } }, { merge:true })); });
  it('✓ update de socio SIN facturarA (regresión)', async () => { await assertSucceeds(ctx('afi').doc('socios/sA').set({ activo:false }, { merge:true })); });
  it('✗ facturarA empresa SIN empresaId',           async () => { await assertFails(ctx('afi').doc('socios/sA').set({ facturarA:{ tipo:'empresa', razonSocial:'ACME' } }, { merge:true })); });
  it('✗ facturarA empresa empresaId no-string',     async () => { await assertFails(ctx('afi').doc('socios/sA').set({ facturarA:{ tipo:'empresa', empresaId:123, razonSocial:'ACME' } }, { merge:true })); });
  it('✗ facturarA tipo inválido',                   async () => { await assertFails(ctx('afi').doc('socios/sA').set({ facturarA:{ tipo:'club' } }, { merge:true })); });
});

describe('E-1 — EMPRESAS.convenio (forma) + gate + shape', () => {
  it('✓ contable crea empresa con convenio fijo + monto', async () => { await assertSucceeds(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:5000 } }))); });
  it('✓ contable crea empresa con convenio per_capita',   async () => { await assertSucceeds(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'per_capita' } }))); });
  it('✓ crea empresa SIN convenio (E-2 lo carga)',  async () => { await assertSucceeds(ctx('afi').collection('empresas').add(EMP())); });
  it('✓ configurar_sistema crea empresa (carga convenio)', async () => { await assertSucceeds(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:1 } }))); });
  it('✗ convenio fijo SIN montoMensual',            async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo' } }))); });
  it('✗ convenio fijo monto negativo',              async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:-1 } }))); });
  it('✗ convenio fijo monto 0',                     async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:0 } }))); });
  it('✗ convenio modo inválido',                    async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'gratis' } }))); });
  it('✗ convenio per_capita CON monto',             async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'per_capita', montoMensual:5000 } }))); });
  it('✗ convenio con clave extra',                  async () => { await assertFails(ctx('cfg').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:1, hack:1 } }))); });
  it('✗ crea empresa con campo fuera del shape',    async () => { await assertFails(ctx('afi').collection('empresas').add(EMP({ hack:1 }))); });
  it('✗ crea empresa SIN razonSocial',              async () => { const e=EMP(); delete e.razonSocial; await assertFails(ctx('afi').collection('empresas').add(e)); });
  it('✓ carga convenio por update (E-2)',           async () => { await assertSucceeds(ctx('cfg').doc('empresas/eA').set({ convenio:{ modo:'fijo', montoMensual:9000 } }, { merge:true })); });
  it('✓ bump ultimoSufijo (alta de miembro)',       async () => { await assertSucceeds(ctx('afi').doc('empresas/eA').set({ ultimoSufijo:1 }, { merge:true })); });
  it('✗ toca numeroConvenio (inmutable)',           async () => { await assertFails(ctx('afi').doc('empresas/eA').set({ numeroConvenio:'999' }, { merge:true })); });
  it('✗ toca tipo (inmutable)',                     async () => { await assertFails(ctx('afi').doc('empresas/eA').set({ tipo:'area_protegida' }, { merge:true })); });
  it('✗ operativo sin cap crea empresa',            async () => { await assertFails(ctx('oper').collection('empresas').add(EMP())); });
  it('✗ afiliado (socio) escribe empresa',          async () => { await assertFails(ctx('socioU').doc('empresas/eA').set({ razonSocial:'H' }, { merge:true })); });
  it('✗ anónimo escribe empresa',                   async () => { await assertFails(anon().collection('empresas').add(EMP())); });
  it('✓ operativo lee empresa',                     async () => { await assertSucceeds(ctx('afi').doc('empresas/eA').get()); });
});

describe('E-1 — EMPRESAS separación estricta convenio (identidad=afiliados · convenio=contable)', () => {
  it('✓ gestionar_afiliados edita razonSocial (identidad)', async () => { await assertSucceeds(ctx('afi').doc('empresas/eA').set({ razonSocial:'Nuevo', actualizadoEn:2 }, { merge:true })); });
  it('✓ gestionar_afiliados crea empresa SIN convenio',    async () => { await assertSucceeds(ctx('afi').collection('empresas').add(EMP())); });
  it('✗ gestionar_afiliados TOCA convenio (update)',        async () => { await assertFails(ctx('afi').doc('empresas/eA').set({ convenio:{ modo:'fijo', montoMensual:5000 } }, { merge:true })); });
  it('✗ gestionar_afiliados CREA empresa con convenio',     async () => { await assertFails(ctx('afi').collection('empresas').add(EMP({ convenio:{ modo:'fijo', montoMensual:5000 } }))); });
  it('✓ configurar_sistema TOCA convenio (update)',         async () => { await assertSucceeds(ctx('cfg').doc('empresas/eA').set({ convenio:{ modo:'fijo', montoMensual:5000 } }, { merge:true })); });
  it('✓ admin TOCA convenio (bypass)',                      async () => { await assertSucceeds(ctx('adm').doc('empresas/eA').set({ convenio:{ modo:'per_capita' } }, { merge:true })); });
  it('✓ gestionar_afiliados edita identidad estando ya cargado el convenio', async () => { await env.withSecurityRulesDisabled(async c=>{ await c.firestore().doc('empresas/eA').set(EMP({ convenio:{ modo:'fijo', montoMensual:1 } })); }); await assertSucceeds(ctx('afi').doc('empresas/eA').set({ razonSocial:'Z', actualizadoEn:3 }, { merge:true })); });
});

describe('E-1 — FACTURAS polimórficas (cliente persona | empresa)', () => {
  it('✓ factura persona (legacy, sin clienteTipo)', async () => { await assertSucceeds(ctx('cfg').collection('facturas').add(FACT_PER())); });
  it('✓ factura persona explícita (clienteTipo)',   async () => { await assertSucceeds(ctx('cfg').collection('facturas').add(FACT_PER({ clienteTipo:'persona' }))); });
  it('✓ factura empresa bien formada',              async () => { await assertSucceeds(ctx('cfg').collection('facturas').add(FACT_EMP())); });
  it('✗ factura híbrida (personaId + empresa)',     async () => { await assertFails(ctx('cfg').collection('facturas').add(FACT_EMP({ personaId:'pA' }))); });
  it('✗ factura empresa SIN clienteId',             async () => { const f=FACT_EMP(); delete f.clienteId; await assertFails(ctx('cfg').collection('facturas').add(f)); });
  it('✗ factura empresa clienteNombre no-string',   async () => { await assertFails(ctx('cfg').collection('facturas').add(FACT_EMP({ clienteNombre:123 }))); });
  it('✗ factura persona SIN personaId',             async () => { const f=FACT_PER(); delete f.personaId; await assertFails(ctx('cfg').collection('facturas').add(f)); });
  it('✗ factura clienteTipo empresa con clienteId no-string', async () => { await assertFails(ctx('cfg').collection('facturas').add(FACT_EMP({ clienteId:123 }))); });
  it('✗ socio NO lee factura de empresa (sin personaId propio)', async () => { await env.withSecurityRulesDisabled(async c=>{ await c.firestore().doc('facturas/fEmp').set(FACT_EMP()); }); await assertFails(ctx('socioU').doc('facturas/fEmp').get()); });
});
