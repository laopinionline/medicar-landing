'use strict';
/*
 * PASO 3 (Tramo 4): backfill de espejos pacientes/{personaId} para socios ACTIVOS cuya persona todavía no
 * tiene un doc en `pacientes` con su id. Hace buscables en el despacho a los socios existentes.
 * merge:true → NUNCA pisa antecedentesCronicos/antecedentesOtros. IDEMPOTENTE (salta los que ya tienen espejo).
 * DRY-RUN por defecto; --apply aplica.  Requiere serviceAccountKey.json (gitignoreada).
 */
const fs=require('fs'), path=require('path'), admin=require('firebase-admin');
const APPLY=process.argv.includes('--apply');
const KEY=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(__dirname,'serviceAccountKey.json');
if(!fs.existsSync(KEY)){ console.error('[espejo-bf] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({credential:admin.credential.cert(require(KEY))});
const db=admin.firestore(), FV=()=>admin.firestore.FieldValue.serverTimestamp();
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();

(async()=>{
  console.log(`\n[espejo-bf] Modo: ${APPLY?'APPLY (escribe)':'DRY-RUN (no escribe)'}\n`);
  const [soc,per,pac]=await Promise.all([db.collection('socios').get(),db.collection('personas').get(),db.collection('pacientes').get()]);
  const perById=new Map(per.docs.map(d=>[d.id,d.data()]));
  const pacExiste=new Set(pac.docs.map(d=>d.id));
  const activos=soc.docs.filter(d=>(d.data()||{}).activo!==false);
  let crear=0, yaTiene=0, sinPersona=0;
  for(const sd of activos){
    const s=sd.data()||{}; const pid=s.personaId;
    if(!pid || !perById.has(pid)){ sinPersona++; console.log(`[warn] socio ${sd.id} (N° ${s.numeroAfiliado||'?'}) sin persona válida — SKIP`); continue; }
    if(pacExiste.has(pid)){ yaTiene++; continue; }              // ya hay espejo/paciente en ese id
    const p=perById.get(pid);
    const esp={
      apellido:p.apellido||'', nombre:p.nombre||'', dni:p.dni||'', fechaNacimiento:p.fechaNacimiento||'', sexo:p.sexo||'',
      telefono:p.telefono||'', direccion:p.direccion||'', apellidoNorm:norm(p.apellido), nombreNorm:norm(p.nombre),
      tipoAfiliado:s.tipoAfiliado||'directo', activo:true, espejoDe:pid, espejoActualizadoEn:FV()
    };
    if(s.numeroAfiliado) esp.numeroAfiliado=s.numeroAfiliado;
    if(s.codigoCorporativo) esp.codigoCorporativo=s.codigoCorporativo;
    crear++;
    console.log(`[crear] pacientes/${pid}  N° ${s.numeroAfiliado||'—'} · ${esp.apellido} ${esp.nombre} · norm(${esp.apellidoNorm}/${esp.nombreNorm})${APPLY?'':'   (dry-run)'}`);
    if(APPLY){ await db.collection('pacientes').doc(pid).set(esp,{merge:true}); }
  }
  console.log(`\n[espejo-bf] socios activos ${activos.length} · a crear espejo ${crear} · ya tenían ${yaTiene} · sin persona ${sinPersona}`);
  console.log(`[espejo-bf] ${APPLY?'ESCRITO.':'DRY-RUN: nada escrito. Correr con --apply.'}\n`);
  process.exit(0);
})().catch(e=>{ console.error('[espejo-bf] ERROR:',e); process.exit(1); });
