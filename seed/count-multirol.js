'use strict';
/* READ-ONLY: solapamiento PRECISO staff↔socio. No escribe nada. */
const fs=require('fs'), path=require('path'), admin=require('firebase-admin');
const KEY=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(__dirname,'serviceAccountKey.json');
if(!fs.existsSync(KEY)){ console.error('falta key'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db=admin.firestore();
(async()=>{
  const [usuarios, staffMed, socios] = await Promise.all([
    db.collection('usuarios').get(), db.collection('staff_medico').get(), db.collection('socios').get() ]);
  const staffUids=new Set(staffMed.docs.map(d=>d.id));
  const socioPersonaIds=new Set(socios.docs.map(d=>(d.data()||{}).personaId).filter(Boolean));
  let staffConPersona=0, staffQueSonSocios=0, afilConStaff=0;
  usuarios.forEach(d=>{
    const u=d.data()||{}; const esStaff=staffUids.has(d.id);
    if(esStaff && u.personaId){ staffConPersona++; if(socioPersonaIds.has(u.personaId)) staffQueSonSocios++; }
    // el otro ángulo: rol afiliado pero uid además en staff_medico
    if(u.rol==='afiliado' && esStaff) afilConStaff++;
  });
  console.log('[count] uids en staff_medico:', staffUids.size, '· socios:', socios.size, '· personaIds de socios:', socioPersonaIds.size);
  console.log('[count] staff con personaId (persona de staff, normal):', staffConPersona);
  console.log('[count] >>> staff_medico cuyo personaId ESTÁ en socios (médico+socio REAL):', staffQueSonSocios);
  console.log('[count] >>> usuarios rol=afiliado que además están en staff_medico:', afilConStaff);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
