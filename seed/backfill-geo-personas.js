'use strict';
/*
 * Tramo 3b: backfill de coords/barrio para PERSONAS viejas sin geolocalizar.
 * Universo: personas con `direccion` no vacía, SIN geoLat y SIN geoPrecision (nunca intentadas).
 *   → las que ya tienen geoPrecision 'sin_ubicar' (checkbox rural / intento previo fallido) NO se reintentan.
 * Motor: misma cadena que el alta (Tramo 3): normalizarDireccion → geoNominatim → barrio (point-in-polygon).
 * Escribe en personas/{id}: geoLat, geoLng, barrio, geoPrecision, geoResueltoEn (mismo shape que episodios).
 * Si Nominatim no resuelve / falla / es rural → geoPrecision:'sin_ubicar' (queda marcada → idempotente).
 * Rate-limit 1.1s entre requests (como geocodificarPendientes). DRY-RUN por defecto; --apply aplica.
 *
 *   node seed/backfill-geo-personas.js            # dry-run: lista el universo, SIN requests a Nominatim
 *   node seed/backfill-geo-personas.js --apply    # geocodifica y escribe
 * Requiere serviceAccountKey.json (gitignoreada) y app/barrios-pergamino.geojson.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(KEY)) { console.error('[geo-bf] falta serviceAccountKey.json'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const FV = () => admin.firestore.FieldValue.serverTimestamp();

// ---- Réplica EXACTA de las funciones geo del cliente (app/index.html :5718-5762) ----
const geoStripAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
function geoNormStreet(raw) {
  let s = geoStripAccents(raw).toUpperCase().trim();
  s = s.replace(/N\xc2\xba/gi, '').replace(/\xc2\xba/gi, '').replace(/N°/g, '').replace(/Nº/g, '');
  s = s.replace(/^(AVDA\.?|AVENIDA|AV\.?|CALLE|C\.?\s|BV\.?|BVAR\.?|BOULEVARD|DR\.?|GRAL\.?|PJE\.?|PASAJE|DIAG\.?|INT\.?|PRES\.?|CNEL\.?|CAP\.?|SGT\.?|TTE\.?|MONSEOR|MONSENOR)\s*/i, '');
  s = s.replace(/^STA\.\s?/i, 'SANTA ').replace(/^STO\.\s?/i, 'SANTO ').replace(/^M\.\s/i, 'MARIANO ').replace(/^BME\.\s?/i, 'BARTOLOME ').replace(/^J\s?J\s/i, 'JUAN JOSE ').replace(/^J\s?A\s/i, 'JOSE A ');
  return s.replace(/\s+/g, ' ').trim();
}
function normalizarDireccion(dom) {
  if (!dom) return { calle: null, altura: null, isRural: true };
  let d = geoStripAccents(dom).trim().toUpperCase();
  if (/^RUTA\b/.test(d) || /ZONA RURAL/i.test(d) || /^ESTANCIA\b/.test(d) || /^CHACRA\b/.test(d)) return { calle: null, altura: null, isRural: true };
  d = d.replace(/\s+B[°OºA]\.?\s*\S+.*$/i, '').replace(/\s+DPTO.*$/i, '').replace(/\s+UF\s.*$/i, '').replace(/\s+S\/N.*$/i, '').replace(/\s+-T\d+.*$/i, '').replace(/\s+TIRA\s.*$/i, '');
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
  const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'medicar-backfill/1.0 (laopinionpergamino@gmail.com)' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const a = await r.json(); if (!a.length) return null;
  const hit = a[0]; return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), exact: !!(altura && hit.address && hit.address.house_number) };
}
// point-in-polygon (ray casting) — equivalente a turf.booleanPointInPolygon sobre las features del geojson
const BARRIOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'barrios-pergamino.geojson'), 'utf8'));
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function barrioDeCoord(lon, lat) {
  for (const f of (BARRIOS.features || [])) {
    const g = f.geometry; if (!g) continue;
    if (g.type === 'Polygon') { if (pointInRing(lon, lat, g.coordinates[0])) return f.properties.nombre; }
    else if (g.type === 'MultiPolygon') { for (const poly of g.coordinates) { if (pointInRing(lon, lat, poly[0])) return f.properties.nombre; } }
  }
  return null;
}
// Misma lógica que afGeocodePersona (Tramo 3), sin el checkbox rural (acá viene de la dirección).
async function geocode(direccion) {
  const nd = normalizarDireccion(direccion || '');
  if (nd.isRural || !nd.calle || !nd.altura) return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV() };
  let hit;
  try { hit = await geoNominatim(nd.calle, nd.altura); }
  catch (e) { return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV(), _err: String(e.message || e) }; }
  if (!hit) return { geoPrecision: 'sin_ubicar', geoResueltoEn: FV() };
  const barrio = barrioDeCoord(hit.lon, hit.lat);
  return { geoLat: hit.lat, geoLng: hit.lon, barrio, geoPrecision: hit.exact ? 'geo_exacto' : 'geo_aprox', geoResueltoEn: FV() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`\n[geo-bf] Modo: ${APPLY ? 'APPLY (escribe + requests a Nominatim)' : 'DRY-RUN (no escribe, sin requests)'}\n`);
  console.log(`[geo-bf] barrios cargados: ${(BARRIOS.features || []).length}`);
  const per = await db.collection('personas').get();
  // Universo: con dirección, sin geoLat, sin geoPrecision (nunca intentadas). sin_ubicar previas NO se reintentan.
  const universo = per.docs.filter(d => { const p = d.data() || {}; return String(p.direccion || '').trim() && p.geoLat == null && p.geoPrecision == null; });
  console.log(`[geo-bf] personas: ${per.size} · universo (a geocodificar): ${universo.length}\n`);
  universo.forEach(d => { const p = d.data() || {}; console.log(`  ${d.id}  dni ${p.dni || '—'}  ·  "${p.direccion}"`); });

  if (!APPLY) { console.log(`\n[geo-bf] DRY-RUN: nada escrito, cero requests a Nominatim. Verificá el universo y corré con --apply.\n`); process.exit(0); }

  console.log(`\n[geo-bf] Geocodificando (rate-limit 1.1s entre requests)…\n`);
  const cont = { geo_exacto: 0, geo_aprox: 0, sin_ubicar: 0, err: 0 };
  for (const d of universo) {
    const p = d.data() || {};
    const res = await geocode(p.direccion);
    if (res._err) cont.err++;
    cont[res.geoPrecision] = (cont[res.geoPrecision] || 0) + 1;
    const { _err, ...upd } = res;
    await d.ref.set(upd, { merge: true });
    console.log(`  ${d.id}  "${p.direccion}" -> ${res.geoPrecision}${res.barrio ? ' · ' + res.barrio : ''}${res._err ? ' (' + res._err + ')' : ''}`);
    // rate-limit solo si hubo request real a Nominatim (no rural)
    const nd = normalizarDireccion(p.direccion || '');
    if (!(nd.isRural || !nd.calle || !nd.altura)) await sleep(1100);
  }
  console.log(`\n[geo-bf] ESCRITO. exacto ${cont.geo_exacto} · aprox ${cont.geo_aprox} · sin_ubicar ${cont.sin_ubicar} · errores ${cont.err}\n`);
  process.exit(0);
})().catch(e => { console.error('[geo-bf] ERROR:', e); process.exit(1); });
