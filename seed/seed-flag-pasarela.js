/* Siembra configuracion/pasarela = {modo:'simulado'}. El admin lo edita (console): 'simulado' | 'mercadopago' | 'modo'. */
const path=require('path'),admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require(path.join(__dirname,'serviceAccountKey.json')))});
const db=admin.firestore();
(async()=>{
  await db.collection('configuracion').doc('pasarela').set({ modo:'simulado', actualizadoEn:admin.firestore.FieldValue.serverTimestamp(), nota:'modo pasarela: simulado (prueba) | mercadopago | modo. El simulador SOLO corre en modo=simulado.' },{merge:true});
  console.log('configuracion/pasarela =', JSON.stringify((await db.collection('configuracion').doc('pasarela').get()).data()));
  process.exit(0);
})();
