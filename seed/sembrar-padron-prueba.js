'use strict';
/*
 * Padrón de prueba REALISTA — 4 afiliados individuales con el shape EXACTO del alta real
 * (afGuardarNuevo modo individual): persona + socio con correlativo REAL de la serie directo
 * (contador socios_directo, patrón transaccional asignarNumeroRaiz) + espejo pacientes + geocode.
 * NO son fixtures: consumen números reales de la serie. Datos generados con PRNG SEMBRADO
 * (dry-run y apply producen los MISMOS 4). Rate Nominatim 1.1s. Planes fijos (joven/senior/area).
 *
 *   node seed/sembrar-padron-prueba.js           # dry-run (sin escribir, sin Nominatim, sin consumir contador)
 *   node seed/sembrar-padron-prueba.js --apply    # crea persona+socio+espejo+geocode
 *
 * ⚠️⚠️ NO RE-CORRER --apply ⚠️⚠️
 *   NO es idempotente: CADA --apply CONSUME 4 correlativos REALES nuevos de la serie directo
 *   (contador socios_directo) y crea 4 socios MÁS. Ya se corrió una vez (creó N° 20805-20808).
 *   Este archivo queda versionado SOLO como documentación de cómo se generó ese padrón de prueba.
 *   Para re-generar otro lote distinto: cambiar el SEED (nuevos nombres) y asumir el consumo de
 *   correlativos. El padrón de prueba se limpia por rango de N° (no lleva esDemo, es shape real puro).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

// ---- PRNG sembrado (mulberry32): dry-run y apply IDÉNTICOS. Cambiá SEED para re-rollear. ----
const SEED = 0x5eed4a11;
let _s = SEED >>> 0;
function rnd() { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randint = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---- Datos realistas argentinos ----
const APELLIDOS = ['Fernández', 'Rodríguez', 'González', 'López', 'Martínez', 'García', 'Pérez', 'Gómez', 'Díaz', 'Romero', 'Sosa', 'Torres', 'Álvarez', 'Benítez', 'Acosta', 'Molina', 'Silva', 'Ramírez', 'Suárez', 'Ferrari'];
const NOMBRES_M = ['Santiago', 'Mateo', 'Juan', 'Lucas', 'Martín', 'Nicolás', 'Tomás', 'Facundo', 'Bruno', 'Ramiro'];
const NOMBRES_F = ['Sofía', 'Valentina', 'Camila', 'Martina', 'Lucía', 'Julieta', 'Florencia', 'Carolina', 'Agustina', 'Paula'];
const PLANES = ['plan-joven', 'plan-senior', 'plan-area'];
const CALLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'calles-pergamino.json'), 'utf8'));

function genCandidato() {
  const fem = rnd() < 0.5;
  const nombre = pick(fem ? NOMBRES_F : NOMBRES_M);
  const apellido = pick(APELLIDOS);
  const dni = String(randint(30000000, 38999999));
  const calle = pick(CALLES);
  const altura = randint(50, 3200);
  const direccion = `${calle} ${altura}`;
  const telefono = '2477' + String(randint(200000, 899999));
  const anio = randint(1958, 2005), mes = String(randint(1, 12)).padStart(2, '0'), dia = String(randint(1, 28)).padStart(2, '0');
  return { apellido, nombre, sexo: fem ? 'F' : 'M', dni, calle, altura, direccion, telefono, fechaNacimiento: `${anio}-${mes}-${dia}`, planId: pick(PLANES) };
}
const CANDS = Array.from({ length: 4 }, genCandidato);
// Coherencia edad↔plan: plan-joven es "hasta 40 años". Si un joven quedó >40, se ajusta SOLO el año
// (menor toque, determinista) para que cierre; el resto de los datos queda idéntico.
CANDS.forEach(c => { if (c.planId === 'plan-joven' && (2026 - parseInt(c.fechaNacimiento.slice(0, 4), 10)) > 40) c.fechaNacimiento = '1992' + c.fechaNacimiento.slice(4); });

// ---- Réplica EXACTA del motor geo del cliente (igual que backfill-geo-personas.js) ----
const geoStripAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
function geoNormStreet(raw) {
  let s = geoStripAccents(raw).toUpperCase().trim();
  s = s.replace(/N[º°]/gi, '').replace(/[º°]/gi, '').replace(/N°/g, '').replace(/Nº/g, '');
  s = s.replace(/^(AVDA\.?|AVENIDA|AV\.?|CALLE|C\.?\s|BV\.?|BVAR\.?|BOULEVARD|DR\.?|GRAL\.?|PJE\.?|PASAJE|DIAG\.?|INT\.?|PRES\.?|CNEL\.?|CAP\.?|SGT\.?|TTE\.?|MONSEOR|MONSENOR)\s*/i, '');
  return s.replace(/\s+/g, ' ').trim();
}
function normalizarDireccion(dom) {
  if (!dom) return { calle: null, altura: null, isRural: true };
  let d = geoStripAccents(dom).trim().toUpperCase();
  let m = d.match(/^(.+?)\s+(\d{1,5})\s*[-/]?\s*$/);
  if (m) { const calle = geoNormStreet(m[1]), altura = parseInt(m[2], 10); if (calle && altura > 0 && altura < 20000) return { calle, altura, isRural: false }; }
  m = d.match(/^(.+?)\s+(\d{1,5})\b/);
  if (m) { const calle = geoNormStreet(m[1]), altura = parseInt(m[2], 10); if (calle && altura > 0 && altura < 20000) return { calle, altura, isRural: false }; }
  const calle = geoNormStreet(d);
  return { calle: calle || null, altura: null, isRural: !calle };
}
async function geoNominatim(calle, altura) {
  const street = encodeURIComponent((altura ? altura + ' ' : '') + calle);
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&country=Argentina&city=Pergamino&street=' + street;
  const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'medicar-padron-prueba/1.0 (laopinionpergamino@gmail.com)' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const a = await r.json(); if (!a.length) return null;
  const hit = a[0]; return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), exact: !!(altura && hit.address && hit.address.house_number) };
}
const BARRIOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'barrios-pergamino.geojson'), 'utf8'));
function pointInRing(lon, lat, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function barrioDeCoord(lon, lat) { for (const f of (BARRIOS.features || [])) { const g = f.geometry; if (!g) continue; if (g.type === 'Polygon') { if (pointInRing(lon, lat, g.coordinates[0])) return f.properties.nombre; } else if (g.type === 'MultiPolygon') { for (const poly of g.coordinates) { if (pointInRing(lon, lat, poly[0])) return f.properties.nombre; } } } return null; }
async function geocode(direccion) {
  const nd = normalizarDireccion(direccion || '');
  if (nd.isRural || !nd.calle || !nd.altura) return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV() };
  let hit; try { hit = await geoNominatim(nd.calle, nd.altura); } catch (e) { return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV(), _err: String(e.message || e) }; }
  if (!hit) return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV() };
  return { geoLat: hit.lat, geoLng: hit.lon, barrio: barrioDeCoord(hit.lon, hit.lat), geoPrecision: hit.exact ? 'geo_exacto' : 'geo_aprox', geoResueltoEn: FV() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normNombre = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// asignarNumeroRaiz — patrón transaccional EXACTO del alta (serie directo).
async function asignarNumeroRaiz(targetRef, buildDoc) {
  const counterRef = db.collection('contadores').doc('socios_directo');
  return await db.runTransaction(async tx => {
    const cs = await tx.get(counterRef); const ultimo = cs.exists ? (cs.data().ultimo || 20000) : 20000; const next = ultimo + 1;
    tx.set(counterRef, { ultimo: next, actualizadoEn: FV() }, { merge: true });
    const correlativo = String(next); tx.set(targetRef, buildDoc(correlativo)); return { correlativo };
  });
}

(async () => {
  console.log(`\n[padron] Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}  (seed ${SEED.toString(16)})\n`);
  const cnt = (await db.collection('contadores').doc('socios_directo').get()).data() || {};
  const ultimo = cnt.ultimo || 20000;
  console.log(`contador socios_directo.ultimo = ${ultimo} → los 4 tomarían ${ultimo + 1}..${ultimo + 4} (transaccional en apply)\n`);

  CANDS.forEach((c, i) => {
    const nd = normalizarDireccion(c.direccion);
    console.log(`  ${i + 1}. ${c.apellido}, ${c.nombre} (${c.sexo}) · DNI ${c.dni} · ${c.fechaNacimiento} · tel ${c.telefono}`);
    console.log(`      dir "${c.direccion}" → geocodifica calle="${nd.calle}" altura=${nd.altura} · plan ${c.planId} · N° ~${ultimo + 1 + i}`);
  });

  if (!APPLY) { console.log(`\n[padron] DRY-RUN: nada escrito, sin Nominatim, contador intacto. Revisá los 4 y corré con --apply.\n`); process.exit(0); }

  const rep = [];
  for (const c of CANDS) {
    // Guarda de unicidad de DNI (como el alta).
    const dup = await db.collection('personas').where('dni', '==', c.dni).limit(1).get();
    if (!dup.empty) { console.log(`  SKIP ${c.apellido}, ${c.nombre}: DNI ${c.dni} ya existe`); continue; }
    // 1) persona (shape del alta)
    const perData = { dni: c.dni, apellido: c.apellido, nombre: c.nombre, sexo: c.sexo, fechaNacimiento: c.fechaNacimiento, telefono: c.telefono, email: '', direccion: c.direccion, antecedentesCronicos: [], antecedentesOtros: '', creadoEn: FV() };
    const pref = await db.collection('personas').add(perData);
    const personaId = pref.id;
    // 2) socio individual con correlativo REAL (tx)
    const socioRef = db.collection('socios').doc();
    const r = await asignarNumeroRaiz(socioRef, (correlativo) => ({ personaId, tipoAfiliado: 'directo', grupoTipo: 'directo', numeroAfiliado: correlativo, numeroRaiz: correlativo, ultimoSufijo: 0, esResponsablePago: true, planId: c.planId, vigenteDesde: FV(), carenciaHasta: null, activo: true, creadoEn: FV() }));
    // 3) geocode-on-save (rate 1.1s) → escribe geo en la persona
    const geo = await geocode(c.direccion);
    const { _err, ...geoUpd } = geo;
    await pref.set(geoUpd, { merge: true });
    // 4) espejo pacientes (shape exacto de afEspejoPaciente)
    await db.collection('pacientes').doc(personaId).set({ apellido: c.apellido, nombre: c.nombre, dni: c.dni, fechaNacimiento: c.fechaNacimiento, sexo: c.sexo, telefono: c.telefono, direccion: c.direccion, apellidoNorm: normNombre(c.apellido), nombreNorm: normNombre(c.nombre), tipoAfiliado: 'directo', activo: true, numeroAfiliado: r.correlativo, espejoDe: personaId, espejoActualizadoEn: FV() }, { merge: true });
    rep.push({ n: r.correlativo, nombre: `${c.apellido}, ${c.nombre}`, dni: c.dni, plan: c.planId, geo: geo.geoPrecision, barrio: geo.barrio || '—' });
    console.log(`  ✓ N°${r.correlativo} ${c.apellido}, ${c.nombre} · ${geo.geoPrecision}${geo.barrio ? ' · ' + geo.barrio : ''}`);
    await sleep(1100); // rate Nominatim
  }
  console.log(`\n[padron] APLICADO ✓  creados: ${rep.length}\n${rep.map(x => '  N°' + x.n + ' ' + x.nombre + ' (' + x.plan + ', ' + x.geo + ', ' + x.barrio + ')').join('\n')}\n`);
  process.exit(0);
})().catch(e => { console.error('[padron] ERROR:', e.message); process.exit(1); });
