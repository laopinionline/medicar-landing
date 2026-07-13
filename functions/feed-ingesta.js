'use strict';
/* PWA-2a — NÚCLEO de la ingesta del feed "Para vos". Puro: recibe una instancia de Firestore ya inicializada.
   Lo usan tanto la CF onSchedule (index.js) como el runner manual (run-ingesta-once.js).
   Escribe docs feed_posts en estado:'pendiente' — NADA se publica solo (curaduría humana obligatoria).
   'cat' SALE DE LA CONFIG por URL, nunca del <category> del RSS (hay notas cross-posteadas).
   'cuerpo'/'firma'/'imagen' JAMÁS para origen 'externo' (contenido de terceros): solo titular+bajada+link. */
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const admin = require('firebase-admin');

// ⚠️ NO usar laopinionline.ar/feed.xml?seccion=... : da 200 pero el revalidate ignora el query → feed global sin filtrar.
const FEED_SOURCES = [
  { url:'https://laopinionline.ar/seccion/salud/feed.xml',        origen:'laopinion', cat:'salud', fuenteNombre:'La Opinión' },
  { url:'https://laopinionline.ar/seccion/gastronomia/feed.xml',  origen:'laopinion', cat:'nutri', fuenteNombre:'La Opinión' },
  { url:'https://laopinionline.ar/seccion/tendencias/feed.xml',   origen:'laopinion', cat:'vida',  fuenteNombre:'La Opinión' },
  { url:'https://www.paho.org/es/rss.xml',                        origen:'externo',   cat:'salud', fuenteNombre:'OPS' },
  { url:'https://www.sac.org.ar/feed/',                           origen:'externo',   cat:'salud', fuenteNombre:'SAC' },
  { url:'https://sanutricion.org.ar/feed/',                       origen:'externo',   cat:'nutri', fuenteNombre:'SANutrición' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/healthyliving.xml',              origen:'externo', cat:'salud', fuenteNombre:'MedlinePlus' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/highbloodpressure.xml',          origen:'externo', cat:'salud', fuenteNombre:'MedlinePlus' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/heartdiseases.xml',              origen:'externo', cat:'salud', fuenteNombre:'MedlinePlus' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/exerciseandphysicalfitness.xml', origen:'externo', cat:'salud', fuenteNombre:'MedlinePlus' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/nutrition.xml',                  origen:'externo', cat:'nutri', fuenteNombre:'MedlinePlus' },
  { url:'https://medlineplus.gov/spanish/feeds/topics/dietaryfats.xml',                origen:'externo', cat:'nutri', fuenteNombre:'MedlinePlus' },
];

const DIA = 86400000;
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'@_', textNodeName:'#text', processEntities:true });

// RED DE SEGURIDAD (ludopatía): contenido de apuestas NO va a la cola de una app de salud. Si el título o la bajada
// matchean, el doc se crea directo en 'descartado' (no 'pendiente'). NO reemplaza la curaduría humana — la respalda.
const APUESTAS_RE = /apuestas|cuotas|casino|betting|pron[oó]sticos/i;
const esApuestas = (titulo, bajada) => APUESTAS_RE.test(String(titulo || '') + ' ' + String(bajada || ''));

const hashGuid = (g) => crypto.createHash('sha1').update(String(g)).digest('hex').slice(0, 24);
const txt = (v) => { if(v==null) return ''; if(typeof v==='object') return String(v['#text']!=null ? v['#text'] : ''); return String(v); };
const stripHtml = (s) => txt(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#\d+;/g,' ').replace(/\s+/g,' ').trim();
const recortar = (s, n) => s.length > n ? s.slice(0, n-1).trimEnd() + '…' : s;

async function fetchTexto(url, ms){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal:ctrl.signal, headers:{ 'User-Agent':'MEDICAR-feed/1.0 (+medicaronline.ar)' } });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function itemsDe(xml){
  const doc = parser.parse(xml);
  const ch = doc && doc.rss && doc.rss.channel;
  if(!ch) return [];
  const it = ch.item;
  return Array.isArray(it) ? it : (it ? [it] : []);
}
function guidDe(item){ const g = item.guid != null ? txt(item.guid) : ''; return g || txt(item.link) || null; }
function imagenDe(item){
  const pick = (x) => { if(!x) return null; const one = Array.isArray(x) ? x[0] : x; return (one && one['@_url']) || null; };
  return pick(item.enclosure) || pick(item['media:content']) || null;
}

async function ingestarUnaFuente(db, src, now){
  const res = { fuente:src.fuenteNombre, cat:src.cat, origen:src.origen, url:src.url, leidos:0, nuevos:0, yaExisten:0, autoDescartados:0, error:null };
  let xml;
  try { xml = await fetchTexto(src.url, 10000); }
  catch(e){ res.error = 'fetch: ' + (e.message || e); return res; }
  let items;
  try { items = itemsDe(xml); }
  catch(e){ res.error = 'parse: ' + (e.message || e); return res; }
  res.leidos = items.length;
  for(const item of items){
    try {
      const guid = guidDe(item); if(!guid) continue;
      const ref = db.collection('feed_posts').doc(hashGuid(guid));
      const snap = await ref.get();
      if(snap.exists){
        res.yaExisten++;
        // Red de seguridad RETROACTIVA: un PENDIENTE (no curado) que matchea apuestas → descartado. NUNCA toca
        // publicado/descartado (jamás revierte una decisión humana; solo re-clasifica lo aún sin curar).
        const cur = snap.data() || {};
        if(cur.estado === 'pendiente' && esApuestas(cur.titulo, cur.bajada)){
          await ref.update({ estado:'descartado', aprobadoEn: admin.firestore.FieldValue.serverTimestamp(), aprobadoPor:'auto-apuestas' });
          res.autoDescartados++;
        }
        continue;
      }
      const titulo = stripHtml(item.title); if(!titulo) continue;
      const pub = txt(item.pubDate); const d = pub ? new Date(pub) : null;
      const fechaFuente = (d && !isNaN(d.getTime())) ? admin.firestore.Timestamp.fromDate(d) : admin.firestore.Timestamp.fromMillis(now);
      const bajada = recortar(stripHtml(item.description), 200);
      const apuestas = esApuestas(titulo, bajada); // red de seguridad ludopatía → nace 'descartado', no 'pendiente'
      const post = {
        guid, origen:src.origen, cat:src.cat, titulo, bajada,
        link: txt(item.link) || guid, fuenteNombre:src.fuenteNombre,
        fechaFuente, estado: apuestas ? 'descartado' : 'pendiente', creadoEn: admin.firestore.FieldValue.serverTimestamp()
      };
      if(apuestas){ post.aprobadoEn = admin.firestore.FieldValue.serverTimestamp(); post.aprobadoPor = 'auto-apuestas'; res.autoDescartados++; }
      // Contenido propio (laopinion/interno) puede llevar cuerpo/firma/imagen. 'externo' → NUNCA (descarte EXPLÍCITO).
      if(src.origen !== 'externo'){
        const firma = stripHtml(item['dc:creator']); if(firma) post.firma = firma;
        const cuerpo = txt(item['content:encoded']); if(cuerpo) post.cuerpo = cuerpo;
        const img = imagenDe(item); if(img) post.imagenUrl = img;
      }
      await ref.set(post);
      res.nuevos++;
    } catch(e){ /* un item roto no tumba la fuente */ }
  }
  return res;
}

async function barridoRetencion(db, now){
  const r = { pendAutoDesc:0, descBorrados:0, pubBorrados:0 };
  const ms = (d, f) => { const v = d.get(f); return v && v.toMillis ? v.toMillis() : null; };
  const pend = await db.collection('feed_posts').where('estado','==','pendiente').get();      // sin curar > 30d → descartado
  for(const d of pend.docs){ const t = ms(d,'creadoEn'); if(t && now - t > 30*DIA){ await d.ref.update({ estado:'descartado', aprobadoEn: admin.firestore.FieldValue.serverTimestamp(), aprobadoPor:'auto' }); r.pendAutoDesc++; } }
  const desc = await db.collection('feed_posts').where('estado','==','descartado').get();      // descartado > 30d → borrar
  for(const d of desc.docs){ const t = ms(d,'aprobadoEn') || ms(d,'creadoEn'); if(t && now - t > 30*DIA){ await d.ref.delete(); r.descBorrados++; } }
  const pub = await db.collection('feed_posts').where('estado','==','publicado').get();        // publicado > 90d → borrar
  for(const d of pub.docs){ const t = ms(d,'aprobadoEn') || ms(d,'creadoEn'); if(t && now - t > 90*DIA){ await d.ref.delete(); r.pubBorrados++; } }
  return r;
}

async function ingestarFeeds(db, opts){
  const now = (opts && opts.now) || Date.now();
  const resultados = [];
  for(const src of FEED_SOURCES){ resultados.push(await ingestarUnaFuente(db, src, now)); } // fuente caída ≠ corrida caída
  const retencion = await barridoRetencion(db, now);
  return { resultados, retencion };
}

module.exports = { ingestarFeeds, FEED_SOURCES, hashGuid, stripHtml };
