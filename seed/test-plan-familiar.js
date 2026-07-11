'use strict';
// Tests del plan por-integrante + historial (Tramo 5a) contra el EMULADOR. Replica planPrecioTotal + la lógica de abonos/historial.
const admin=require('firebase-admin');
admin.initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-medicar'});
const db=admin.firestore(), FV=()=>admin.firestore.FieldValue.serverTimestamp();
// --- réplica EXACTA de app/index.html ---
function planPrecioTotal(plan, integrantes){
  const base=Number(plan&&plan.precio)||0;
  if(!plan || plan.modeloPrecio!=='por_integrante') return base;
  const extra=Number(plan.precioExtraIntegrante)||0;
  const baseInt=(plan.integrantesBase!=null)?Number(plan.integrantesBase):1;
  return base + Math.max(0,(Number(integrantes)||0)-baseInt)*extra;
}
let fails=0; const assert=(c,m)=>{ if(!c){ console.error('  ✗ '+m); fails++; } else console.log('  ✓ '+m); };
(async()=>{
  console.log('\n[T1] plan FIJO se comporta como hoy (ignora integrantes)');
  assert(planPrecioTotal({precio:18000}, 5)===18000, 'sin modeloPrecio → 18000 (fijo, compat plan viejo)');
  assert(planPrecioTotal({modeloPrecio:'fijo',precio:18000}, 5)===18000, "modeloPrecio:'fijo' → 18000");

  console.log('\n[T2] por_integrante (base=40000, incluidos=1, extra=10000): 0/1/3/5 dependientes');
  const P={modeloPrecio:'por_integrante',precio:40000,precioExtraIntegrante:10000,integrantesBase:1};
  assert(planPrecioTotal(P,0)===40000, '0 dep → 40000 (base)');
  assert(planPrecioTotal(P,1)===40000, '1 dep → 40000 (1 incluido)');
  assert(planPrecioTotal(P,3)===60000, '3 dep → 60000 (40000 + 2×10000)');
  assert(planPrecioTotal(P,5)===80000, '5 dep → 80000 (40000 + 4×10000)');

  console.log('\n[T3] abono de titular con 2 dependientes activos → total congelado correcto');
  await db.collection('planes').doc('PLAN_FAM').set(P);
  // socSnap simulado: titular + 2 deps activos + 1 dep de OTRO titular + 1 dep INACTIVO (no en socSnap de activos)
  const socActivos=[
    {id:'TIT',   d:{planId:'PLAN_FAM', activo:true}},
    {id:'DEP1',  d:{titularSocioId:'TIT', activo:true, planId:null}},
    {id:'DEP2',  d:{titularSocioId:'TIT', activo:true, planId:null}},
    {id:'OTRODEP',d:{titularSocioId:'OTRO', activo:true, planId:null}},
  ];
  const integrantes = socActivos.filter(x=>x.d.titularSocioId==='TIT').length; // = conteo en memoria (como generarAbonos)
  const plan=(await db.collection('planes').doc('PLAN_FAM').get()).data();
  const precio=planPrecioTotal(plan, integrantes);
  await db.collection('abonos').add({ socioId:'TIT', planId:'PLAN_FAM', precioSugerido:precio, precioFinal:precio, integrantesFacturados:integrantes, estado:'generado' });
  const ab=(await db.collection('abonos').where('socioId','==','TIT').limit(1).get()).docs[0].data();
  assert(integrantes===2, '2 dependientes activos del titular (el de OTRO titular NO cuenta)');
  assert(ab.precioSugerido===50000 && ab.precioFinal===50000, 'abono congela 50000 (40000 + 1×10000)');
  assert(ab.integrantesFacturados===2, 'abono registra integrantesFacturados=2');

  console.log('\n[T4] edición de precio → escribe historialPrecios');
  const old={precio:40000, modeloPrecio:'por_integrante', precioExtraIntegrante:10000};
  const precioNuevo=45000, extraNuevo=12000, modeloNuevo='por_integrante';
  const cambio=(Number(old.precio)||0)!==precioNuevo || (old.modeloPrecio||'fijo')!==modeloNuevo || (Number(old.precioExtraIntegrante)||0)!==(Number(extraNuevo)||0);
  assert(cambio===true, 'detecta cambio (precio 40000→45000, extra 10000→12000)');
  if(cambio) await db.collection('planes').doc('PLAN_FAM').collection('historialPrecios').add({ precioAnterior:old.precio, precioNuevo, extraAnterior:old.precioExtraIntegrante, extraNuevo, modeloAnterior:old.modeloPrecio, modeloNuevo, cambiadoPor:'uidX', cambiadoEn:FV() });
  const hist=await db.collection('planes').doc('PLAN_FAM').collection('historialPrecios').get();
  assert(hist.size===1, 'se escribió 1 doc en historialPrecios');
  const h=hist.docs[0].data();
  assert(h.precioAnterior===40000 && h.precioNuevo===45000 && h.extraAnterior===10000 && h.extraNuevo===12000, 'historial: anterior/nuevo de precio y extra correctos');
  // sin cambio → no escribe
  const sinCambio=(Number(old.precio)||0)!==40000 || (old.modeloPrecio||'fijo')!=='por_integrante' || (Number(old.precioExtraIntegrante)||0)!==10000;
  assert(sinCambio===false, 'editar sin cambiar precio/extra/modelo → NO escribe historial');

  console.log('\n[T5] plan viejo sin campos nuevos → fijo');
  await db.collection('planes').doc('PLAN_VIEJO').set({nombre:'Plan 01', precio:18000, activo:true}); // sin modeloPrecio
  const pv=(await db.collection('planes').doc('PLAN_VIEJO').get()).data();
  assert(planPrecioTotal(pv, 4)===18000, 'plan sin modeloPrecio con 4 integrantes → 18000 (fijo)');

  console.log(`\n${fails===0?'✅ TODOS LOS TESTS PASARON':'❌ '+fails+' FALLO(S)'}\n`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('ERROR:',e);process.exit(1);});
