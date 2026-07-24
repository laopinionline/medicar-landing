'use strict';
/*
 * Tramo 5d — Carga de los 5 planes reales tomados de las tarjetas hardcodeadas de la landing
 * (index.html:1144-1228): nombres, precios, descripciones, listas "qué incluye" y CTAs, tal cual.
 * Crea planes/{id} + escribe el espejo planes_publicos/{id} replicando EXACTO planEspejoLanding
 * (app/index.html) para que la landing los tome por fetch (runtime, sin deploy) y salga del fallback.
 *
 *  - Ids deterministas → idempotente (re-correr mergea, no duplica).
 *  - Plan 01 NO se toca (tiene socios reales; sin mostrarEnLanding → no sale en la landing).
 *  - Carencias: no están en la landing → carenciaDias 0 (Lucas ajusta luego desde el ABM).
 *  - OJO subtítulo: planEspejoLanding lo COMPUTA ('por mes' / 'según acuerdo' si hay etiquetaPrecio).
 *    Los sufijos hardcodeados ("· 2 personas", "· por local") NO se reproducen (así queda el ABM).
 *    Familiar (por_integrante, sin etiqueta) → "desde $40.000" (default acordado).
 *
 *   node seed/cargar-planes-landing.js           # dry-run: imprime los 5 planes + espejos
 *   node seed/cargar-planes-landing.js --apply    # escribe planes/ + planes_publicos/
 */
const path = require('path');
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

// Los 5 planes, extraídos literalmente de las tarjetas de index.html.
const PLANES = [
  {
    id: 'plan-joven', orden: 1, destacado: false,
    nombre: 'Plan Joven',
    descripcion: 'Cobertura individual para personas de hasta 30 años.',
    precio: 20000, modeloPrecio: 'fijo',
    ctaLanding: 'Quiero afiliarme',
    itemsLanding: ['Cobertura individual', 'Atención domiciliaria 24hs', 'Médico de guardia permanente', 'Unidad móvil equipada', 'Línea directa 443044'],
  },
  {
    id: 'plan-familiar', orden: 2, destacado: true,
    nombre: 'Plan Familiar',
    descripcion: 'Para parejas y familias. Siempre 2 personas base, con la posibilidad de sumar más integrantes.',
    precio: 40000, modeloPrecio: 'por_integrante', precioExtraIntegrante: 10000, integrantesBase: 1,
    ctaLanding: 'Quiero afiliarme',
    itemsLanding: ['2 personas incluidas', '+$10.000 por integrante adicional', 'Atención pediátrica y geriátrica', 'Prioridad en la atención', 'Traslados de emergencia', 'Guardia pasiva domiciliaria'],
  },
  {
    id: 'plan-senior', orden: 3, destacado: false,
    nombre: 'Plan Senior',
    descripcion: 'Cobertura individual para adultos mayores, con atención geriátrica especializada.',
    precio: 60000, modeloPrecio: 'fijo',
    ctaLanding: 'Quiero afiliarme',
    itemsLanding: ['Cobertura individual', 'Atención geriátrica especializada', 'Médico de guardia permanente', 'Traslados de emergencia', 'Guardia pasiva domiciliaria'],
  },
  {
    id: 'plan-area', orden: 4, destacado: false,
    nombre: 'Área Protegida',
    descripcion: 'Cobertura por domicilio comercial. Incluye a un responsable del local. Valor por local.',
    precio: 70000, modeloPrecio: 'fijo',
    ctaLanding: 'Consultar',
    itemsLanding: ['Cobertura por domicilio comercial', 'Un responsable incluido', 'Atención en el local 24hs', 'Médico de guardia permanente', 'Ideal para comercios y oficinas'],
  },
  {
    id: 'plan-corporativo', orden: 5, destacado: false,
    nombre: 'Corporativo',
    descripcion: 'Para empresas, instituciones y organizaciones. Precio según convenio.',
    precio: 0, modeloPrecio: 'fijo', etiquetaPrecio: 'A medida',
    ctaLanding: 'Solicitar cotización',
    itemsLanding: ['Cobertura para equipos de trabajo', 'Guardia en eventos y actividades', 'Capacitación en primeros auxilios', 'Coordinación con SAME y hospitales', 'Precio negociado'],
  },
];

// Doc plan (planes/{id}): modelo interno + campos de landing.
function planDoc(p) {
  const d = {
    nombre: p.nombre, descripcion: p.descripcion,
    precio: p.precio, modeloPrecio: p.modeloPrecio,
    carenciaDias: 0, coberturas: {}, activo: true,
    // campos de landing (5b)
    mostrarEnLanding: true, ordenLanding: p.orden, destacado: p.destacado,
    itemsLanding: p.itemsLanding, ctaLanding: p.ctaLanding,
    actualizadoEn: FV(),
  };
  if (p.modeloPrecio === 'por_integrante') { d.precioExtraIntegrante = p.precioExtraIntegrante; d.integrantesBase = p.integrantesBase; }
  if (p.etiquetaPrecio) d.etiquetaPrecio = p.etiquetaPrecio;
  return d;
}

// Espejo (planes_publicos/{id}): réplica EXACTA de planEspejoLanding (app/index.html).
function espejoDoc(p) {
  const tieneEtiqueta = p.etiquetaPrecio && String(p.etiquetaPrecio).trim();
  const precioMostrado = tieneEtiqueta
    ? String(p.etiquetaPrecio).trim()
    : (p.modeloPrecio === 'por_integrante' ? ('desde $' + (Number(p.precio) || 0).toLocaleString('es-AR')) : ('$' + (Number(p.precio) || 0).toLocaleString('es-AR')));
  const subtitulo = tieneEtiqueta ? 'según acuerdo' : 'por mes';
  return {
    nombre: p.nombre || '', descripcion: p.descripcion || '',
    precioMostrado, subtitulo,
    items: Array.isArray(p.itemsLanding) ? p.itemsLanding : [],
    destacado: !!p.destacado, orden: Number(p.orden) || 0,
    cta: (p.ctaLanding && String(p.ctaLanding).trim()) || 'Quiero afiliarme',
    actualizadoEn: FV(),
  };
}

(async () => {
  console.log(`\n[cargar-planes] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  // Guarda: avisar si ya existe un plan con el mismo nombre bajo OTRO id (evita duplicar lo de Lucas).
  const existentes = await db.collection('planes').get();
  const porNombre = {};
  existentes.docs.forEach(d => { porNombre[(d.data().nombre || '').trim()] = d.id; });
  let choque = false;
  for (const p of PLANES) {
    const otro = porNombre[p.nombre];
    if (otro && otro !== p.id) { console.log(`  ⚠️ "${p.nombre}" ya existe bajo id ${otro} (≠ ${p.id}) — se ESCRIBIRÍA un duplicado.`); choque = true; }
  }
  console.log(`  planes existentes: ${existentes.size} (${existentes.docs.map(d => (d.data().nombre || '')).join(', ')})`);
  console.log(`  Plan 01 NO se toca.${choque ? '' : ' Sin choques de nombre.'}\n`);

  for (const p of PLANES) {
    const pd = planDoc(p), ed = espejoDoc(p);
    console.log('──────────────────────────────────────────');
    console.log(`planes/${p.id}`);
    console.log(JSON.stringify({ ...pd, actualizadoEn: '<FV>' }, null, 0));
    console.log(`planes_publicos/${p.id}  →  precioMostrado="${ed.precioMostrado}"  subtitulo="${ed.subtitulo}"  destacado=${ed.destacado}  orden=${ed.orden}  cta="${ed.cta}"  items=${ed.items.length}`);
  }
  console.log('──────────────────────────────────────────');

  if (!APPLY) { console.log(`\n[cargar-planes] DRY-RUN: nada escrito. ${choque ? 'RESOLVER LOS CHOQUES antes de --apply.' : 'Corré con --apply.'}\n`); process.exit(0); }

  let n = 0;
  for (const p of PLANES) {
    await db.collection('planes').doc(p.id).set(planDoc(p), { merge: true });
    await db.collection('planes_publicos').doc(p.id).set(espejoDoc(p), { merge: true });
    n++;
  }
  const pub = await db.collection('planes_publicos').get();
  console.log(`\n[cargar-planes] ESCRITO ✓  planes+espejos: ${n}`);
  console.log(`  planes_publicos ahora: ${pub.size} → ${pub.docs.map(d => d.data().nombre + ' (orden ' + d.data().orden + ')').sort().join(', ')}\n`);
  process.exit(0);
})().catch(e => { console.error('[cargar-planes] ERROR:', e.message); process.exit(1); });
