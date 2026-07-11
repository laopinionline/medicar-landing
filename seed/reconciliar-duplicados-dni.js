'use strict';
/*
 * PASO 1 (Tramo 4): reconcilia/limpia las personas físicas duplicadas por DNI (mismo DNI en `personas` Y
 * `pacientes` con ids distintos), previo a encender el espejo pacientes/{personaId}.
 *
 * Por caso, comparando el NOMBRE normalizado persona vs paciente:
 *  - mismo id            -> YA CONVERGIDO: nada.
 *  - nombre COINCIDE     -> RECONCILIAR: mergear antecedentes al espejo pacientes/{personaId}, remapear
 *                           episodios.pacienteId -> personaId, borrar el paciente viejo huérfano.
 *  - nombre DIFIERE      -> FALSO DUPLICADO (paciente de test que reusó un DNI placeholder): BORRAR ese
 *                           paciente + sus episodios de test. La PERSONA no se toca nunca.
 *
 * DRY-RUN por defecto; --apply aplica.  Requiere serviceAccountKey.json (gitignoreada).
 */
const fs=require('fs'), path=require('path'), admin=require('firebase-admin');
const APPLY=process.argv.includes('--apply');
const KEY=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(__dirname,'serviceAccountKey.json');
if(!fs.existsSync(KEY)){ console.error('[recon] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore(), FV=()=>admin.firestore.FieldValue.serverTimestamp();
const arrU=(...a)=>admin.firestore.FieldValue.arrayUnion(...a);
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const nom=d=>norm(`${d.apellido||''} ${d.nombre||''}`);

(async()=>{
  console.log(`\n[recon] Modo: ${APPLY?'APPLY (escribe)':'DRY-RUN (no escribe)'}\n`);
  const [per,pac,soc,eps]=await Promise.all([
    db.collection('personas').get(), db.collection('pacientes').get(),
    db.collection('socios').get(), db.collection('episodios').get()]);
  const perByDni=new Map(), pacByDni=new Map();
  per.docs.forEach(d=>{ const n=String((d.data()||{}).dni||'').trim(); if(n){ (perByDni.get(n)||perByDni.set(n,[]).get(n)).push(d); } });
  pac.docs.forEach(d=>{ const n=String((d.data()||{}).dni||'').trim(); if(n){ (pacByDni.get(n)||pacByDni.set(n,[]).get(n)).push(d); } });
  const socioByPersona=new Map(); soc.docs.forEach(d=>{ const p=(d.data()||{}).personaId; if(p) socioByPersona.set(p,d); });
  const epsByPac=new Map(); eps.docs.forEach(d=>{ const p=(d.data()||{}).pacienteId; if(p){ (epsByPac.get(p)||epsByPac.set(p,[]).get(p)).push(d); } });

  const dnis=[...perByDni.keys()].filter(n=>pacByDni.has(n));
  console.log(`[recon] DNIs en AMBAS colecciones: ${dnis.length} -> ${dnis.join(', ')}\n`);
  const plan=[];
  for(const dni of dnis){
    const perDoc=perByDni.get(dni)[0], pacDoc=pacByDni.get(dni)[0];
    const p=perDoc.data(), pc=pacDoc.data();
    const socioDoc=socioByPersona.get(perDoc.id);
    const mismoId=perDoc.id===pacDoc.id;
    const nameMatch=nom(p)===nom(pc);
    const epsViejos=(epsByPac.get(pacDoc.id)||[]);
    const c={ dni, personaId:perDoc.id, pacienteId:pacDoc.id, mismoId, nombrePersona:nom(p), nombrePaciente:nom(pc),
      personaTieneSocio:!!socioDoc, socioNum:socioDoc?((socioDoc.data()||{}).numeroAfiliado):null,
      episodiosDelPacViejo:epsViejos.map(e=>(e.data()||{}).nroIncidente||e.id) };
    if(mismoId){ c.decision='YA CONVERGIDO (mismo id) — nada'; c.accion={}; }
    else if(nameMatch){ c.decision=`RECONCILIAR -> gana personaId ${perDoc.id}`; c.accion={mergeAntecedentesA:perDoc.id, remapEpisodios:epsViejos.length, borrarPacienteViejo:pacDoc.id}; }
    else{ c.decision='BORRAR paciente de test (nombre no coincide, DNI reusado) + sus episodios — PERSONA INTACTA'; c.accion={borrarPaciente:pacDoc.id, borrarEpisodios:epsViejos.map(e=>e.id), personaNoSeToca:perDoc.id}; }
    plan.push(c);
    console.log('── DNI '+dni+' ──'); console.log(JSON.stringify(c,null,1)); console.log('');
  }
  if(APPLY){
    console.log('[recon] APLICANDO…\n');
    for(const c of plan){
      if(c.decision.startsWith('BORRAR paciente de test')){
        for(const eid of c.accion.borrarEpisodios){ await db.collection('episodios').doc(eid).delete(); }
        await db.collection('pacientes').doc(c.pacienteId).delete();
        console.log(`  DNI ${c.dni}: borrado paciente ${c.pacienteId} + ${c.accion.borrarEpisodios.length} episodio(s); persona ${c.personaId} intacta`);
      } else if(c.decision.startsWith('RECONCILIAR')){
        const v=(await db.collection('pacientes').doc(c.pacienteId).get()).data()||{};
        const m={}; if(Array.isArray(v.antecedentesCronicos)&&v.antecedentesCronicos.length) m.antecedentesCronicos=arrU(...v.antecedentesCronicos);
        if(v.antecedentesOtros) m.antecedentesOtros=v.antecedentesOtros;
        if(Object.keys(m).length){ m.reconciliadoEn=FV(); await db.collection('pacientes').doc(c.personaId).set(m,{merge:true}); }
        for(const e of (epsByPac.get(c.pacienteId)||[])){ await e.ref.set({pacienteId:c.personaId, pacienteIdRemapeadoDe:c.pacienteId},{merge:true}); }
        await db.collection('pacientes').doc(c.pacienteId).delete();
        console.log(`  DNI ${c.dni}: reconciliado -> ${c.personaId}`);
      } else { console.log(`  DNI ${c.dni}: sin acción (convergido)`); }
    }
    console.log('\n[recon] APLICADO.');
  } else { console.log('[recon] DRY-RUN: nada escrito. Verificá y corré con --apply.'); }
  process.exit(0);
})().catch(e=>{ console.error('[recon] ERROR:',e); process.exit(1); });
