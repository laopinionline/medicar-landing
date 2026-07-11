'use strict';
/*
 * F3 (fixture permanente) — titulardemo@medicaronline.ar: un TITULAR con grupo familiar por_integrante,
 * para verificar la vista de grupo + cuota en la PWA. Docs IDÉNTICOS a la salida del alta+F1.
 *   - persona demo-titular + socio 90002 (N° manual, fuera de serie → NO toca contadores), plan-familiar
 *     (por_integrante), numeroRaiz 90002, ultimoSufijo 2.
 *   - 2 dependientes: 90002-01 ACTIVO + 90002-02 BAJA (activo:false), cada uno con personaId propio,
 *     titularSocioId, titularPersonaId (llave F2) y nombreVista ("Apellido, Nombre").
 *   - usuarios/{titulardemo}.personaId = demo-titular.
 * Todo esDemo:true. SIN espejo pacientes (decisión A del 5c → no aparece en el despacho).
 * Ids deterministas → idempotente. Efecto consciente A+A: el titular (planId+activo) generará abono
 * mensual (N° 90002, anulable); los dependientes (planId:null) NO.
 *
 * PASSWORD: NUNCA en el repo. Si la cuenta Auth no existe, --apply la crea usando la env var
 * MEDICAR_TITULARDEMO_PW (Lucas la pone en runtime). Si ya existe, no se necesita password.
 *   node seed/fixture-titular-demo.js                                   # dry-run
 *   MEDICAR_TITULARDEMO_PW='...' node seed/fixture-titular-demo.js --apply
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const EMAIL = 'titulardemo@medicaronline.ar';
const PLAN_ID = 'plan-familiar'; // por_integrante (5d)
const nombreDe = (p) => (((((p || {}).apellido) || '') + ', ' + (((p || {}).nombre) || '')).replace(/^, /, '').replace(/, $/, '')) || ((p || {}).dni) || '';

// Personas y socios (ids deterministas).
const PER = {
  'demo-titular': { apellido: 'DEMO', nombre: 'Titular', dni: '99000001', telefono: '2477000002', direccion: '', sexo: '', fechaNacimiento: '', activo: true, esDemo: true },
  'demo-dep-uno': { apellido: 'DEMO', nombre: 'Dependiente Uno', dni: '99000002', telefono: '', direccion: '', sexo: '', fechaNacimiento: '', activo: true, esDemo: true },
  'demo-dep-dos': { apellido: 'DEMO', nombre: 'Dependiente Dos', dni: '99000003', telefono: '', direccion: '', sexo: '', fechaNacimiento: '', activo: true, esDemo: true },
};
const TITULAR_SOCIO = 'demo-socio-90002';
const SOC = {
  'demo-socio-90002':    { personaId: 'demo-titular', planId: PLAN_ID, numeroAfiliado: '90002', numeroRaiz: '90002', ultimoSufijo: 2, tipoAfiliado: 'directo', grupoTipo: 'familiar', esResponsablePago: true, activo: true, esDemo: true },
  'demo-socio-90002-01': { personaId: 'demo-dep-uno', titularSocioId: TITULAR_SOCIO, titularPersonaId: 'demo-titular', nombreVista: nombreDe(PER['demo-dep-uno']), planId: null, numeroAfiliado: '90002-01', tipoAfiliado: 'directo', grupoTipo: 'familiar', esResponsablePago: false, activo: true, esDemo: true },
  'demo-socio-90002-02': { personaId: 'demo-dep-dos', titularSocioId: TITULAR_SOCIO, titularPersonaId: 'demo-titular', nombreVista: nombreDe(PER['demo-dep-dos']), planId: null, numeroAfiliado: '90002-02', tipoAfiliado: 'directo', grupoTipo: 'familiar', esResponsablePago: false, activo: false, esDemo: true },
};

(async () => {
  console.log(`\n[fixture] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  // Plan por_integrante existe?
  const plan = await db.collection('planes').doc(PLAN_ID).get();
  console.log(`plan ${PLAN_ID}: existe=${plan.exists}${plan.exists ? ` (${plan.data().nombre}, modelo=${plan.data().modeloPrecio}, precio=${plan.data().precio}, base=${plan.data().integrantesBase}, extra=${plan.data().precioExtraIntegrante})` : ' ⚠️ FALTA'}`);

  // Auth account
  let uid = null;
  try { uid = (await auth.getUserByEmail(EMAIL)).uid; console.log(`Auth ${EMAIL}: existe uid=${uid}`); }
  catch { console.log(`Auth ${EMAIL}: NO existe → --apply la crea (requiere env MEDICAR_TITULARDEMO_PW)`); }

  // Guarda de unicidad de N° (excluye los propios ids demo).
  for (const [sid, s] of Object.entries(SOC)) {
    const dup = (await db.collection('socios').where('numeroAfiliado', '==', s.numeroAfiliado).get()).docs.filter(d => d.id !== sid);
    if (dup.length) console.log(`  ⚠️ N° ${s.numeroAfiliado} ya usado por otro socio: ${dup.map(d => d.id).join(',')}`);
  }

  console.log('\nOperaciones:');
  Object.keys(PER).forEach(id => console.log(`  personas/${id}  "${PER[id].apellido}, ${PER[id].nombre}"  DNI ${PER[id].dni}`));
  Object.entries(SOC).forEach(([id, s]) => console.log(`  socios/${id}  N°${s.numeroAfiliado}  ${s.titularSocioId ? `dep de ${s.titularSocioId} · titularPersonaId=${s.titularPersonaId} · nombreVista="${s.nombreVista}" · ` : `titular · ultimoSufijo=${s.ultimoSufijo} · planId=${s.planId} · `}activo=${s.activo}`));
  console.log(`  usuarios/{titulardemo}.personaId = demo-titular`);
  console.log(`  (SIN espejo pacientes → no aparece en el despacho)`);

  // Cuota esperada (1 activo, base 1) para el reporte.
  if (plan.exists) {
    const pl = plan.data(); const activos = 1; // 90002-01 activo; 90002-02 baja
    const base = Number(pl.precio) || 0, extra = Number(pl.precioExtraIntegrante) || 0, baseInt = pl.integrantesBase != null ? Number(pl.integrantesBase) : 1;
    const cuota = pl.modeloPrecio === 'por_integrante' ? base + Math.max(0, activos - baseInt) * extra : base;
    console.log(`\n  Cuota esperada en la PWA: $${cuota.toLocaleString('es-AR')} (1 dependiente activo; el de baja NO cuenta)`);
  }

  if (!APPLY) { console.log('\n[fixture] DRY-RUN: nada escrito. Corré con --apply (y MEDICAR_TITULARDEMO_PW si hay que crear la cuenta).\n'); process.exit(0); }

  // Auth (crea si falta, usando la env var; nunca hardcodeada)
  if (!uid) {
    const pw = process.env.MEDICAR_TITULARDEMO_PW;
    if (!pw) { console.error('[fixture] Falta MEDICAR_TITULARDEMO_PW para crear la cuenta. Abortado.'); process.exit(1); }
    uid = (await auth.createUser({ email: EMAIL, password: pw, displayName: 'Titular Demo', emailVerified: true })).uid;
    console.log(`[fixture] Auth creado: ${EMAIL} → ${uid}`);
  }

  for (const [id, p] of Object.entries(PER)) await db.collection('personas').doc(id).set({ ...p, actualizadoEn: FV() }, { merge: true });
  for (const [id, s] of Object.entries(SOC)) await db.collection('socios').doc(id).set({ ...s, actualizadoEn: FV() }, { merge: true });
  // usuarios/{uid}: shape completo de afiliado (MISMO que afiliadodemo) — el gate de la PWA exige rol/roles.
  // Idempotente: un re-run completa los campos faltantes; creadoEn solo en el primer alta.
  const uref = db.collection('usuarios').doc(uid);
  const ubase = { rol: 'afiliado', roles: ['afiliado'], email: EMAIL, nombre: 'Titular Demo', afiliadoId: null, medicoId: null, personaId: 'demo-titular' };
  if (!(await uref.get()).exists) ubase.creadoEn = FV();
  await uref.set(ubase, { merge: true });

  // Verificación
  const pac = []; for (const pid of Object.keys(PER)) if ((await db.collection('pacientes').doc(pid).get()).exists) pac.push(pid);
  console.log(`\n[fixture] APLICADO ✓  personas=${Object.keys(PER).length} · socios=${Object.keys(SOC).length} · usuarios.personaId=demo-titular`);
  console.log(`  espejos pacientes creados: ${pac.length} ${pac.length ? '⚠️ ' + JSON.stringify(pac) : '(ninguno ✓)'}\n`);
  process.exit(0);
})().catch(e => { console.error('[fixture] ERROR:', e.message); process.exit(1); });
