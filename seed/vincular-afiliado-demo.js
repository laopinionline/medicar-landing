'use strict';
/*
 * Tramo 5c — Vínculo del usuario demo afiliadodemo@medicaronline.ar al modelo real (A+A):
 *  - persona DEMO (DNI 00000001, sin dirección/geo)
 *  - socio N° 90001 (manual, fuera de series 20/30/40xxx → NO toca contadores), Plan 01, activo:true
 *  - SIN espejo pacientes (no aparece en el buscador de despacho — alta por script directo)
 *  - usuarios/{uid}.personaId = la persona demo
 * Ids FIJOS → idempotente y fácil de revertir. Efecto consciente: generarAbonos le generará abono
 * mensual (tiene planId + activo). NO carga itemsLanding en Plan 01 (contenido real es de Lucas).
 *   node seed/vincular-afiliado-demo.js           # dry-run
 *   node seed/vincular-afiliado-demo.js --apply    # aplica
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const auth = admin.auth();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

const EMAIL = 'afiliadodemo@medicaronline.ar';
const PERSONA_ID = 'demo-afiliado-90001';
const SOCIO_ID = 'demo-socio-90001';
const NUM = '90001';

(async () => {
  console.log(`\n[vincular-demo] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const uid = (await auth.getUserByEmail(EMAIL)).uid;
  console.log('afiliadodemo uid:', uid);

  // Plan 01 (único plan real)
  const planes = await db.collection('planes').where('nombre', '==', 'Plan 01').limit(1).get();
  if (planes.empty) throw new Error('no encontré el plan "Plan 01"');
  const planId = planes.docs[0].id;
  console.log('planId (Plan 01):', planId);

  // Guarda de unicidad de N° (excluye el propio socio demo por si se re-corre)
  const dup = await db.collection('socios').where('numeroAfiliado', '==', NUM).get();
  const dupOtro = dup.docs.filter(d => d.id !== SOCIO_ID);
  if (dupOtro.length) throw new Error('N° ' + NUM + ' ya usado por otro socio: ' + dupOtro.map(d => d.id).join(','));

  const hoy = new Date().toISOString().slice(0, 10);
  const persona = {
    apellido: 'DEMO', nombre: 'Afiliado', dni: '00000001',
    telefono: '2477000001', direccion: '', sexo: '', fechaNacimiento: '',
    activo: true, esDemo: true, actualizadoEn: FV(),
  };
  const socio = {
    personaId: PERSONA_ID, planId, numeroAfiliado: NUM, numeroRaiz: NUM,
    tipoAfiliado: 'directo', grupoTipo: 'directo', ultimoSufijo: 0,
    esResponsablePago: true, activo: true, vigenteDesde: hoy, esDemo: true, actualizadoEn: FV(),
  };

  console.log('\nOperaciones:');
  console.log('  personas/' + PERSONA_ID, '=', JSON.stringify({ ...persona, actualizadoEn: '<FV>' }));
  console.log('  socios/' + SOCIO_ID, '=', JSON.stringify({ ...socio, actualizadoEn: '<FV>' }));
  console.log('  usuarios/' + uid + '  ← personaId:', PERSONA_ID);
  console.log('  (SIN escribir pacientes/' + PERSONA_ID + ' → no aparece en despacho)');

  if (!APPLY) { console.log('\n[vincular-demo] DRY-RUN: nada escrito. Corré con --apply.\n'); process.exit(0); }

  await db.collection('personas').doc(PERSONA_ID).set(persona, { merge: true });
  await db.collection('socios').doc(SOCIO_ID).set(socio, { merge: true });
  await db.collection('usuarios').doc(uid).set({ personaId: PERSONA_ID }, { merge: true });

  // Verificación de lectura
  const uCheck = (await db.collection('usuarios').doc(uid).get()).data();
  const sCheck = (await db.collection('socios').doc(SOCIO_ID).get()).data();
  const pacExists = (await db.collection('pacientes').doc(PERSONA_ID).get()).exists;
  console.log('\n[vincular-demo] APLICADO ✓');
  console.log('  usuarios.personaId =', uCheck.personaId);
  console.log('  socio 90001: planId=' + sCheck.planId + ' activo=' + sCheck.activo + ' tipo=' + sCheck.tipoAfiliado);
  console.log('  espejo pacientes/' + PERSONA_ID + ' existe?:', pacExists, pacExists ? '⚠️ NO esperado' : '✓ (no aparece en despacho)');
  process.exit(0);
})().catch(e => { console.error('[vincular-demo] ERROR:', e.message); process.exit(1); });
