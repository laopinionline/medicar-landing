'use strict';
// Tests del espejo pacientes/{personaId} (Tramo 4) contra el EMULADOR. Replica afEspejoPaciente.
const admin=require('firebase-admin');
admin.initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-medicar'});
const db=admin.firestore(), FV=()=>admin.firestore.FieldValue.serverTimestamp();
const arrU=(...a)=>admin.firestore.FieldValue.arrayUnion(...a);
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
async function afEspejoPaciente(personaId, per, socio){
  per=per||{}; socio=socio||{};
  const esp={ apellido:per.apellido||'', nombre:per.nombre||'', dni:per.dni||'', fechaNacimiento:per.fechaNacimiento||'', sexo:per.sexo||'',
    telefono:per.telefono||'', direccion:per.direccion||'', apellidoNorm:norm(per.apellido), nombreNorm:norm(per.nombre),
    tipoAfiliado:socio.tipoAfiliado||'directo', activo:socio.activo!==false, espejoDe:personaId, espejoActualizadoEn:FV() };
  if(socio.numeroAfiliado) esp.numeroAfiliado=socio.numeroAfiliado;
  if(socio.codigoCorporativo) esp.codigoCorporativo=socio.codigoCorporativo;
  await db.collection('pacientes').doc(personaId).set(esp,{merge:true});
}
let fails=0; const assert=(c,m)=>{ if(!c){ console.error('  ✗ '+m); fails++; } else console.log('  ✓ '+m); };
(async()=>{
  console.log('\n[T1] alta directa → espejo id==personaId + norms');
  await afEspejoPaciente('PID1',{apellido:'Pérez',nombre:'María',dni:'11222333',telefono:'2477-1',direccion:'San Martín 100'},{tipoAfiliado:'directo',numeroAfiliado:'20800',activo:true});
  let d=(await db.collection('pacientes').doc('PID1').get()).data();
  assert(!!d,'pacientes/PID1 existe (id == personaId)');
  assert(d.apellidoNorm==='perez'&&d.nombreNorm==='maria','apellidoNorm=perez, nombreNorm=maria');
  assert(d.numeroAfiliado==='20800'&&d.tipoAfiliado==='directo'&&d.espejoDe==='PID1','numeroAfiliado/tipoAfiliado/espejoDe OK');

  console.log('\n[T2] el espejo NUNCA pisa antecedentes (fuente clínica = paciente)');
  await db.collection('pacientes').doc('PID1').set({antecedentesCronicos:arrU('hipertensión'),antecedentesOtros:'marcapasos'},{merge:true}); // simula epClinicaCard
  await afEspejoPaciente('PID1',{apellido:'Pérez',nombre:'María',dni:'11222333',telefono:'2477-9',direccion:'Otra 200'},{tipoAfiliado:'directo',numeroAfiliado:'20800',activo:true}); // re-set (edición)
  d=(await db.collection('pacientes').doc('PID1').get()).data();
  assert(Array.isArray(d.antecedentesCronicos)&&d.antecedentesCronicos.includes('hipertensión')&&d.antecedentesOtros==='marcapasos','antecedentes INTACTOS tras re-set del espejo');
  assert(d.telefono==='2477-9'&&d.direccion==='Otra 200','campos buscables/mostrables SÍ se actualizan (tel/dirección)');

  console.log('\n[T3] edición de apellido → espejo actualizado (apellido + apellidoNorm)');
  await afEspejoPaciente('PID1',{apellido:'Gómez',nombre:'María',dni:'11222333'},{tipoAfiliado:'directo',numeroAfiliado:'20800',activo:true});
  d=(await db.collection('pacientes').doc('PID1').get()).data();
  assert(d.apellido==='Gómez'&&d.apellidoNorm==='gomez','apellido y apellidoNorm actualizados');
  assert(d.antecedentesOtros==='marcapasos','antecedentes siguen intactos tras editar apellido');

  console.log('\n[T4] socio corporativo → espejo con numeroAfiliado "30702-01" buscable EXACTO');
  await afEspejoPaciente('PID2',{apellido:'Empleado',nombre:'Uno',dni:'44555666'},{tipoAfiliado:'corporativo',numeroAfiliado:'30702-01',activo:true});
  const exact=await db.collection('pacientes').where('numeroAfiliado','==','30702-01').limit(1).get();
  assert(!exact.empty && exact.docs[0].id==='PID2','búsqueda exacta por N° "30702-01" encuentra el espejo');

  console.log('\n[T5] búsqueda por apellidoNorm (prefijo) encuentra el espejo (como dspBuscarQ)');
  const pre=await db.collection('pacientes').where('apellidoNorm','>=','gom').where('apellidoNorm','<=','gom').limit(15).get();
  assert(pre.docs.some(x=>x.id==='PID1'),'prefijo "gom" trae a PID1 (Gómez)');

  console.log('\n[T6] estado del socio -> espejo (afGuardarEdit / afBaja): activo se sincroniza, antecedentes intactos');
  // arranca activo:true con antecedentes (simula historial clínico)
  await afEspejoPaciente('PID3',{apellido:'Baja',nombre:'Test',dni:'77888999'},{tipoAfiliado:'directo',numeroAfiliado:'20999',activo:true});
  await db.collection('pacientes').doc('PID3').set({antecedentesCronicos:arrU('asma'),antecedentesOtros:'nota clínica'},{merge:true});
  // DESACTIVAR (como afGuardarEdit con af-e-activo='no' o afBaja(id,false))
  await afEspejoPaciente('PID3',{apellido:'Baja',nombre:'Test',dni:'77888999'},{tipoAfiliado:'directo',numeroAfiliado:'20999',activo:false});
  let d3=(await db.collection('pacientes').doc('PID3').get()).data();
  assert(d3.activo===false,'espejo.activo=false tras desactivar');
  assert(Array.isArray(d3.antecedentesCronicos)&&d3.antecedentesCronicos.includes('asma')&&d3.antecedentesOtros==='nota clínica','antecedentes INTACTOS tras cambio de estado');
  // REACTIVAR
  await afEspejoPaciente('PID3',{apellido:'Baja',nombre:'Test',dni:'77888999'},{tipoAfiliado:'directo',numeroAfiliado:'20999',activo:true});
  d3=(await db.collection('pacientes').doc('PID3').get()).data();
  assert(d3.activo===true,'espejo.activo=true tras reactivar');

  console.log('\n[T7] unicidad del EDIT: self-exclude + N° libre + N° ocupado por otro');
  const socios=[{id:'S1',numeroAfiliado:'30700'},{id:'S2',numeroAfiliado:'30500'}];
  const checkEdit=(id,numero)=>socios.some(s=>s.id!==id && String(s.numeroAfiliado)===numero);
  assert(checkEdit('S1','30700')===false,'editar S1 SIN cambiar N° (30700) → NO colisiona (self-exclude)');
  assert(checkEdit('S1','40000')===false,'editar S1 a N° libre 40000 → NO colisiona → guarda');
  assert(checkEdit('S1','30500')===true, 'editar S1 a 30500 (ocupado por OTRO) → colisiona → bloquea');

  console.log('\n[T8] afBaja crea el espejo COMPLETO aunque no exista (nunca parcial)');
  await afEspejoPaciente('PID_BAJA',{apellido:'Torres',nombre:'Lucía',dni:'30303030',telefono:'2477-x',direccion:'Calle 1'},{tipoAfiliado:'directo',numeroAfiliado:'30700',activo:false});
  const dB=(await db.collection('pacientes').doc('PID_BAJA').get()).data();
  assert(dB.activo===false,'espejo.activo=false tras baja');
  assert(dB.apellido==='Torres'&&dB.apellidoNorm==='torres'&&dB.numeroAfiliado==='30700'&&dB.nombreNorm==='lucia','espejo COMPLETO (apellido/norms/numeroAfiliado) — NO parcial');

  console.log(`\n${fails===0?'✅ TODOS LOS TESTS PASARON':'❌ '+fails+' FALLO(S)'}\n`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('ERROR:',e);process.exit(1);});
