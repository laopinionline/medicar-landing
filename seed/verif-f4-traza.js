'use strict';
/* VERIFICACIÓN EN VIVO — F4: episodiosDeArea (traza del contrato). Invocada como CONTABLEDEMO (rol contable).
 * Siembra un episodio-lugar CON campos clínicos → la CF debe devolver count + {nroIncidente,fecha} y NINGÚN campo
 * clínico. Además: el contable NO puede leer /episodios directo (REST 403). Limpia todo con guards. */
const path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const CONTABLE_UID = '1gKZmxfT2xfJmkh7DpBbkSKIMO32';
const API_KEY = 'AIzaSyCXCkuaFC_8qMPAEIUlBoQiv7hBgFDq1iw', PROJ = 'medicar-sistema';
const CF = 'https://southamerica-east1-medicar-sistema.cloudfunctions.net/episodiosDeArea';
const MARK = '_verifF4';
let ok = 0, fail = 0;
const chk = (l, c, e) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}${c ? '' : (e ? '  → ' + e : '')}`); c ? ok++ : fail++; };
async function tok() { const ct = await admin.auth().createCustomToken(CONTABLE_UID); const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) }); return (await r.json()).idToken; }
async function callCF(data, t) { const r = await fetch(CF, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ data }) }); return r.json(); }

let empRef, epRef;
(async () => {
  console.log('=== SETUP: área + episodio-lugar CON campos clínicos ===');
  empRef = await db.collection('empresas').add({ razonSocial: 'VERIF F4 (borrar)', tipo: 'area_protegida', activo: true, numeroConvenio: 'V-F4', convenio: { modo: 'fijo', montoMensual: 50000 }, [MARK]: true });
  epRef = await db.collection('episodios').add({
    estado: 'cerrado', nroIncidente: 997701, creadoEn: FV(),
    codigoPresuntivo: 'rojo', motivoLlamado: 'DATO CLINICO QUE NO DEBE SALIR', domicilio: 'Calle Secreta 123',
    desenlace: { codigoReal: 'rojo' }, pac: { nombre: 'PACIENTE CLINICO' },
    atribucion: { tipo: 'lugar', empresaId: empRef.id, areaNombre: 'VERIF F4', dirId: 'd', socioId: null, planSnapshot: null },
    [MARK]: true,
  });
  console.log('  área', empRef.id, '· episodio', epRef.id);

  console.log('\n=== 1) el contable invoca episodiosDeArea ===');
  const t = await tok();
  const r = await callCF({ empresaId: empRef.id }, t);
  chk('la CF corrió sin error', !r.error && r.result, JSON.stringify(r.error || ''));
  const res = r.result || {};
  chk('count ≥ 1 (contó el episodio-lugar)', (res.count || 0) >= 1, JSON.stringify(res.count));
  const item = (res.items || []).find(x => x.nroIncidente === 997701);
  chk('el item trae nroIncidente + nroIncidenteFmt + fecha', !!item && item.nroIncidenteFmt && item.fecha, JSON.stringify(item));

  console.log('\n=== 2) 🔑 NINGÚN campo clínico sale de la CF ===');
  const blob = JSON.stringify(res);
  chk('NO filtra motivo', !/DATO CLINICO/.test(blob));
  chk('NO filtra domicilio', !/Calle Secreta/.test(blob));
  chk('NO filtra codigoPresuntivo/desenlace', !/rojo/.test(blob));
  chk('NO filtra nombre del paciente', !/PACIENTE CLINICO/.test(blob));
  chk('las claves del item son SOLO administrativas', item && Object.keys(item).sort().join(',') === 'fecha,nroIncidente,nroIncidenteFmt', item && Object.keys(item).join(','));

  console.log('\n=== 3) el contable NO lee /episodios directo (privacidad clínica) ===');
  const rest = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents/episodios/${epRef.id}`, { headers: { Authorization: 'Bearer ' + t } });
  chk('GET /episodios/{id} → 403 (regla no abierta)', rest.status === 403, 'status ' + rest.status);

  console.log('\n=== 4) LIMPIEZA (guards por marker) ===');
  const del = async (ref, label) => { const s = await ref.get(); if (!s.exists) { console.log('  · ya no', label); return; } if (!s.data()[MARK]) { console.log('  ✗ ABORTO (sin marker)', label); process.exitCode = 1; return; } await ref.delete(); console.log('  ✓ borrado', label); };
  await del(epRef, 'episodio'); await del(empRef, 'empresa');

  console.log(`\n${fail ? '✗' : '✓'} verif-f4-traza: ${ok} ok, ${fail} fallo(s)`);
  process.exit(process.exitCode || (fail ? 1 : 0));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
