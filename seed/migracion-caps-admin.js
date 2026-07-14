// MIGRACIÓN — Tablero de habilidades, Fase 1 (paso DATA, ANTES del deploy de reglas).
// Siembra el preset "admin general" a los usuarios con rol admin, para que al remover el bypass isAdmin()
// de las reglas NO queden pelados (ventana de corte cero). Idempotente. Limpia caps huérfanas.
//
// Uso:
//   node migracion-caps-admin.js            -> DRY-RUN (no escribe; muestra qué haría). SEGURO.
//   node migracion-caps-admin.js --apply    -> APLICA (update de usuarios/{uid}.permisos). Solo en el deploy.
//
// Preset = las 8 caps de gestión que el admin tenía HOY por bypass de rol (configurar_sistema/facturar/clinico/
// afiliados/marketing/cobranza/personal/curar_novedades). NO incluye las operativas (moviles/guardias/agenda/
// despachar) — el admin nunca las tuvo (eran cap pura). Se preservan otras caps 'true' ya presentes.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const ADMIN_PRESET = ['configurar_sistema','facturar','clinico','gestionar_afiliados','marketing','gestionar_cobranza','gestionar_personal','curar_novedades'];
const HUERFANAS = ['ver_dashboard','ver_auditoria']; // borradas de CAPS: se limpian del doc
const CAPS_VIGENTES = new Set([...ADMIN_PRESET,'gestionar_moviles','gestionar_guardias','gestionar_agenda_turnos','despachar_episodios']);

(async () => {
  const snap = await db.collection('usuarios').get();
  const objetivo = [];
  snap.forEach(d => {
    const x = d.data();
    const roles = Array.isArray(x.roles) ? x.roles : (x.rol ? [x.rol] : []);
    if (!roles.includes('admin')) return;                 // solo admins (superadmin no necesita permisos: cortocircuita)
    const prev = (x.permisos && typeof x.permisos === 'object') ? x.permisos : {};
    // nuevo permisos = caps 'true' previas VIGENTES (sin huérfanas) + preset admin en true
    const next = {};
    for (const [k, v] of Object.entries(prev)) if (v === true && CAPS_VIGENTES.has(k)) next[k] = true;
    for (const k of ADMIN_PRESET) next[k] = true;
    const prevKeys = Object.keys(prev).sort();
    const nextKeys = Object.keys(next).sort();
    const suma = nextKeys.filter(k => prev[k] !== true);
    const limpia = prevKeys.filter(k => HUERFANAS.includes(k));
    const cambia = JSON.stringify(prevKeys) !== JSON.stringify(nextKeys) || suma.length > 0 || limpia.length > 0;
    objetivo.push({ uid: d.id, email: x.email || d.id, roles: roles.join('+'), suma, limpia, next, cambia });
  });

  console.log(`\n=== MIGRACIÓN caps admin — ${APPLY ? 'APPLY' : 'DRY-RUN (no escribe)'} ===`);
  console.log(`Admins encontrados: ${objetivo.length}\n`);
  for (const o of objetivo) {
    console.log(`• ${o.email.padEnd(34)} [${o.roles}]`);
    console.log(`    + agrega: ${o.suma.length ? o.suma.join(', ') : '(nada; ya tenía el preset)'}`);
    if (o.limpia.length) console.log(`    - limpia huérfanas: ${o.limpia.join(', ')}`);
    console.log(`    = permisos final: ${Object.keys(o.next).join(', ')}`);
  }

  if (!APPLY) { console.log('\nDRY-RUN: no se escribió nada. Correr con --apply en el paso DATA del deploy.'); process.exit(0); }

  let escritos = 0;
  for (const o of objetivo) {
    if (!o.cambia) continue;
    await db.collection('usuarios').doc(o.uid).update({ permisos: o.next }); // update: reemplaza el campo permisos (limpia huérfanas)
    escritos++;
  }
  console.log(`\nAPLICADO: ${escritos} usuario(s) actualizados.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
