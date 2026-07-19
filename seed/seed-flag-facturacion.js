/* Siembra configuracion/facturacion = {motor:'cf'} — el flag del dispatcher del panel. ROLLBACK = poner motor:'cliente'
 * en la consola de Firestore (el próximo click usa el motor cliente, sin deploy). */
const path=require('path'),admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json')))});
const db=admin.firestore();
(async()=>{
  await db.collection('configuracion').doc('facturacion').set({ motor:'cf', actualizadoEn:admin.firestore.FieldValue.serverTimestamp(), nota:'motor: cf=server-side (default) | cliente=rollback al motor viejo' },{merge:true});
  const d=await db.collection('configuracion').doc('facturacion').get();
  console.log('configuracion/facturacion =', JSON.stringify(d.data()));
  process.exit(0);
})();
