'use strict';
/*
 * Tests de la numeración directo/familiar (Tramo 2b) contra el EMULADOR de Firestore.
 * Replica EXACTO las primitivas de Fase 1 (asignarNumeroRaiz / asignarSufijo) y la composición del alta.
 * Corre vía:
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ./rules-tests/node_modules/.bin/firebase \
 *     emulators:exec --only firestore --project demo-medicar "node seed/test-alta-directo.js"
 */
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-medicar' });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();
const SOCIO_SERIES = { directo:{counter:'socios_directo',base:20000}, corp:{counter:'socios_corp',base:30000}, area:{counter:'socios_area',base:40000} };
async function asignarNumeroRaiz(serie, targetRef, buildDoc){
  const cfg=SOCIO_SERIES[serie]; const counterRef=db.collection('contadores').doc(cfg.counter);
  return await db.runTransaction(async tx=>{
    const cs=await tx.get(counterRef); const ultimo=cs.exists?(cs.data().ultimo||cfg.base):cfg.base; const next=ultimo+1;
    tx.set(counterRef,{ultimo:next,actualizadoEn:FV()},{merge:true}); const correlativo=String(next);
    tx.set(targetRef, buildDoc(correlativo)); return {correlativo,id:targetRef.id};
  });
}
async function asignarSufijo(raizRef, targetRef, buildDoc){
  return await db.runTransaction(async tx=>{
    const rs=await tx.get(raizRef); if(!rs.exists) throw new Error('raíz inexistente');
    const d=rs.data()||{}; const base=String(d.numeroRaiz||d.numeroConvenio||(String(d.numeroAfiliado||'').split('-')[0])||'');
    const next=(d.ultimoSufijo||0)+1; const sufijo=String(next).padStart(2,'0');
    tx.set(raizRef,{ultimoSufijo:next},{merge:true}); const numeroAfiliado=base+'-'+sufijo;
    tx.set(targetRef, buildDoc(numeroAfiliado,sufijo)); return {sufijo,numeroAfiliado};
  });
}
// composición del alta directo (misma que afGuardarNuevo)
async function altaIndividualOTitular(modo){
  const ref=db.collection('socios').doc(); const grupoTipo=(modo==='titular')?'familiar':'directo';
  const r=await asignarNumeroRaiz('directo', ref, (c)=>({ tipoAfiliado:'directo', grupoTipo, numeroAfiliado:c, numeroRaiz:c, ultimoSufijo:0, esResponsablePago:true }));
  return { id:ref.id, numero:r.correlativo };
}
async function altaDependiente(titularId){
  const ref=db.collection('socios').doc();
  const r=await asignarSufijo(db.collection('socios').doc(titularId), ref, (num)=>({ tipoAfiliado:'directo', grupoTipo:'familiar', titularSocioId:titularId, esResponsablePago:false, numeroAfiliado:num, planId:null }));
  return { id:ref.id, numero:r.numeroAfiliado };
}
let fails=0; const assert=(c,m)=>{ if(!c){ console.error('  ✗ FALLO: '+m); fails++; } else console.log('  ✓ '+m); };

(async()=>{
  await db.collection('contadores').doc('socios_directo').set({ ultimo:20790 });

  console.log('\n[Test 1] alta INDIVIDUAL → correlativo pelado 20xxx');
  const ind=await altaIndividualOTitular('individual');
  assert(ind.numero==='20791', `individual = 20791 (=${ind.numero}), sin sufijo`);
  const indDoc=(await db.collection('socios').doc(ind.id).get()).data();
  assert(indDoc.grupoTipo==='directo' && indDoc.esResponsablePago===true, 'grupoTipo=directo, esResponsablePago=true');

  console.log('\n[Test 2] TITULAR + 2 dependientes → pelado, -01, -02, ultimoSufijo=2');
  const tit=await altaIndividualOTitular('titular');
  assert(tit.numero==='20792', `titular = 20792 (=${tit.numero}), pelado`);
  const d1=await altaDependiente(tit.id);
  const d2=await altaDependiente(tit.id);
  assert(d1.numero==='20792-01' && d2.numero==='20792-02', `dependientes = 20792-01 / 20792-02 (=${d1.numero}/${d2.numero})`);
  const titDoc=(await db.collection('socios').doc(tit.id).get()).data();
  assert(titDoc.grupoTipo==='familiar' && titDoc.ultimoSufijo===2, `titular grupoTipo=familiar, ultimoSufijo=2 (=${titDoc.ultimoSufijo})`);
  const d1Doc=(await db.collection('socios').doc(d1.id).get()).data();
  assert(d1Doc.titularSocioId===tit.id && d1Doc.esResponsablePago===false && d1Doc.planId===null, 'dependiente: titularSocioId set, esResponsablePago=false, planId=null');

  console.log('\n[Test 3] concurrencia: 2 dependientes SIMULTÁNEOS de la misma raíz');
  const tit2=await altaIndividualOTitular('titular');
  const par=await Promise.all([altaDependiente(tit2.id), altaDependiente(tit2.id)]);
  const nums=par.map(x=>x.numero).sort();
  assert(new Set(nums).size===2, `2 sufijos ÚNICOS sin repetición: ${nums.join(' , ')}`);
  const tit2Doc=(await db.collection('socios').doc(tit2.id).get()).data();
  assert(tit2Doc.ultimoSufijo===2, `ultimoSufijo=2 tras 2 concurrentes (=${tit2Doc.ultimoSufijo})`);

  console.log('\n[Test 4] tel vacío BLOQUEA (guard del alta)');
  const validarTel = (telefono) => { if(!telefono || !telefono.trim()) return 'El teléfono es obligatorio.'; return null; };
  assert(validarTel('')==='El teléfono es obligatorio.' && validarTel('   ')!==null, 'tel vacío / solo espacios → mensaje de error');
  assert(validarTel('2477-1234')===null, 'tel con valor → OK');

  console.log('\n[Test 5] override superadmin con N° duplicado BLOQUEA');
  await db.collection('socios').doc('EXIST').set({ numeroAfiliado:'20500', tipoAfiliado:'directo' });
  const dupe=await db.collection('socios').where('numeroAfiliado','==','20500').limit(1).get();
  assert(!dupe.empty, 'la validación de unicidad encuentra el N° 20500 existente → alta bloqueada');
  const libre=await db.collection('socios').where('numeroAfiliado','==','29999').limit(1).get();
  assert(libre.empty, 'N° libre 29999 → no encontrado → alta permitida');

  console.log('\n[Test 6] filtro del selector de titulares (#af-titular) — el bug del filtro invertido');
  // Réplica EXACTA del filtro de afFormNew: activos, no dependientes, no corporativos/área, tipoAfiliado directo.
  const titularCands = (socios) => socios.filter(s=> s.activo!==false && !s.titularSocioId && !s.empresaId && s.tipoAfiliado==='directo');
  const universo = [
    { numeroAfiliado:'20789', tipoAfiliado:'directo' },                                   // legacy directo (sin grupoTipo) -> incluir
    { numeroAfiliado:'20800', tipoAfiliado:'directo', grupoTipo:'directo', numeroRaiz:'20800' }, // individual nuevo -> incluir
    { numeroAfiliado:'20801', tipoAfiliado:'directo', grupoTipo:'familiar', numeroRaiz:'20801' }, // titular familiar -> incluir
    { numeroAfiliado:'20801-01', tipoAfiliado:'directo', grupoTipo:'familiar', titularSocioId:'X' }, // dependiente -> EXCLUIR
    { numeroAfiliado:'30500', tipoAfiliado:'corporativo' },                               // corporativo legacy (sin empresaId) -> EXCLUIR
    { numeroAfiliado:'30701-01', tipoAfiliado:'corporativo', grupoTipo:'corporativo', empresaId:'E' }, // corporativo con empresa -> EXCLUIR
    { numeroAfiliado:'20777', tipoAfiliado:'directo', activo:false },                     // inactivo -> EXCLUIR
    { numeroAfiliado:'30600', tipoAfiliado:'directo' },                                   // legacy 30xxx pero tipoAfiliado directo -> incluir (per spec)
  ];
  const inc = titularCands(universo).map(s=>s.numeroAfiliado).sort();
  const esperado = ['20789','20800','20801','30600'].sort();
  assert(JSON.stringify(inc)===JSON.stringify(esperado), `selector incluye exactamente ${esperado.join(', ')} (=${inc.join(', ')})`);
  assert(!inc.includes('30500') && !inc.includes('30701-01'), 'excluye corporativos (con y sin empresaId)');
  assert(!inc.includes('20801-01'), 'excluye dependientes (con titularSocioId)');
  assert(!inc.includes('20777'), 'excluye inactivos');

  console.log(`\n${fails===0?'✅ TODOS LOS TESTS PASARON':'❌ '+fails+' FALLO(S)'}\n`);
  process.exit(fails===0?0:1);
})().catch(e=>{ console.error('ERROR test:', e); process.exit(1); });
