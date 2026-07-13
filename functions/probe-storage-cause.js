'use strict';
// Evidencia dura del bug PWA-2c (Storage feed/): reglas vigentes por la API (no el archivo local) + buckets del proyecto.
const { GoogleAuth } = require('google-auth-library');
const PROJECT = 'medicar-sistema';

(async () => {
  const auth = new GoogleAuth({ keyFile: __dirname + '/../seed/serviceAccountKey.json', scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const get = async (url) => { const r = await client.request({ url }); return r.data; };

  console.log('=== 1) RELEASES (firebaserules) ===');
  const rel = await get(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`);
  const storageRels = (rel.releases || []).filter(r => r.name.includes('firebase.storage'));
  (rel.releases || []).forEach(r => console.log(' ', r.name, '->', r.rulesetName, '(upd', r.updateTime + ')'));

  console.log('\n=== 2) SOURCE del ruleset RELEASED en cada bucket de Storage ===');
  for (const r of storageRels) {
    const rs = await get(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets/${r.rulesetName.split('/').pop()}`);
    const files = (rs.source && rs.source.files) || [];
    console.log(`\n--- ${r.name} (ruleset ${r.rulesetName.split('/').pop()}, created ${rs.createTime}) ---`);
    files.forEach(f => console.log(f.content));
  }

  console.log('\n=== 3) BUCKETS del proyecto (GCS) ===');
  try {
    const b = await get(`https://storage.googleapis.com/storage/v1/b?project=${PROJECT}`);
    (b.items || []).forEach(x => console.log(' ', x.name, '| location', x.location, '| created', x.timeCreated));
  } catch (e) { console.log('  (no pude listar buckets:', e.message + ')'); }

  console.log('\n=== 4) firebasestorage: buckets registrados en Firebase ===');
  try {
    const fb = await get(`https://firebasestorage.googleapis.com/v1beta/projects/${PROJECT}/buckets`);
    (fb.buckets || []).forEach(x => console.log(' ', x.name));
  } catch (e) { console.log('  (no pude:', e.message + ')'); }

  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
