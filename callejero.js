/* MEDICAR — Callejero canónico de Pergamino (módulo COMPARTIDO, servido por Pages).
 * Núcleo EXTRAÍDO tal cual de app/index.html (normalización + CALLE_ALIAS + resolverCalleId): síncrono, client-side,
 * jamás bloquea. app/ mantiene su copia inline intacta (migración = follow-up). Lo consume socio/ (checkout).
 *   Callejero.cargar(path?) -> Promise (lazy fetch de calles-pergamino.json a memoria)
 *   Callejero.resolver(dom) -> { calleId, altura }   (calleId null = fuera del callejero / rural / ambiguo)
 *   Callejero.opciones()    -> [nombres]  (para el <datalist>)   ·   Callejero.cargado() -> bool
 */
(function (global) {
  'use strict';
  var CALLES = [];      // nombres del callejero (calles-pergamino.json)
  var IDX = null;       // índice de búsqueda memoizado: normStreet -> {calleId,nombre} | null (ambiguo)
  var cargaP = null;

  function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function normStreet(raw) {
    var s = stripAccents(raw).toUpperCase().trim();
    s = s.replace(/N\xc2\xba/gi, '').replace(/\xc2\xba/gi, '').replace(/N°/g, '').replace(/Nº/g, '');
    s = s.replace(/^(AVDA\.?|AVENIDA|AV\.?|CALLE|C\.?\s|BV\.?|BVAR\.?|BOULEVARD|DR\.?|GRAL\.?|PJE\.?|PASAJE|DIAG\.?|INT\.?|PRES\.?|CNEL\.?|CAP\.?|SGT\.?|TTE\.?|MONSEOR|MONSENOR)\s*/i, '');
    s = s.replace(/^STA\.\s?/i, 'SANTA ').replace(/^STO\.\s?/i, 'SANTO ').replace(/^M\.\s/i, 'MARIANO ').replace(/^BME\.\s?/i, 'BARTOLOME ').replace(/^J\s?J\s/i, 'JUAN JOSE ').replace(/^J\s?A\s/i, 'JOSE A ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function normalizarDireccion(dom) {
    if (!dom) return { calle: null, altura: null, isRural: true };
    var d = stripAccents(dom).trim().toUpperCase();
    if (/^RUTA\b/.test(d) || /ZONA RURAL/i.test(d) || /^ESTANCIA\b/.test(d) || /^CHACRA\b/.test(d)) return { calle: null, altura: null, isRural: true };
    d = d.replace(/\s+B[°OºA]\.?\s*\S+.*$/i, '').replace(/\s+DPTO.*$/i, '').replace(/\s+UF\s.*$/i, '').replace(/\s+S\/N.*$/i, '').replace(/\s+-T\d+.*$/i, '').replace(/\s+TIRA\s.*$/i, '');
    var m = d.match(/^(.+?)\s+(\d{1,5})\s*[-/]?\s*$/);
    if (m) { var calle = normStreet(m[1]), altura = parseInt(m[2], 10); if (calle && altura > 0 && altura < 20000) return { calle: calle, altura: altura, isRural: false }; }
    m = d.match(/^(.+?)\s+(\d{1,5})\b/);
    if (m) { var calle2 = normStreet(m[1]), altura2 = parseInt(m[2], 10); if (calle2 && altura2 > 0 && altura2 < 20000) return { calle: calle2, altura: altura2, isRural: false }; }
    var calle3 = normStreet(d);
    return { calle: calle3 || null, altura: null, isRural: !calle3 };
  }
  function calleSlug(nombre) { return stripAccents(String(nombre || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  var CALLE_ALIAS = {
    'mitre': 'bartolome-mitre', 'felipe-gomez': 'dr-felipe-gomez', 'monsenor-scalabrini': 'avenida-monsenor-scalabrini',
    'marcelino-ugarte': 'boulevard-marcelino-ugarte', 'liniers': 'boulevard-liniers', 'saenz-pena': 'roque-saenz-pena',
    'scalabrini-ortiz': 'raul-scalabrini-ortiz', 'pedroni': 'jose-pedroni', 'saucedo': 'dr-manuel-saucedo', 'doctor-m-saucedo': 'dr-manuel-saucedo'
  };
  function calleCanon(slug) { return (slug && CALLE_ALIAS[slug]) || slug || null; }
  function callesIndex() {
    if (IDX) return IDX;
    var m = new Map();
    for (var i = 0; i < CALLES.length; i++) { var k = normStreet(CALLES[i]); if (!k) continue; if (m.has(k)) m.set(k, null); else m.set(k, { calleId: calleSlug(CALLES[i]), nombre: CALLES[i] }); }
    if (CALLES.length) IDX = m;
    return m;
  }
  function resolver(domicilio) {
    var nd = normalizarDireccion(domicilio || '');
    var out = { calleId: null, altura: (nd && typeof nd.altura === 'number') ? nd.altura : null };
    if (!nd || nd.isRural || !nd.calle) return out;
    var hit = callesIndex().get(nd.calle);                 // undefined=miss · null=ambiguo · {calleId}=hit
    if (hit && hit.calleId) out.calleId = calleCanon(hit.calleId);
    return out;
  }
  function cargar(path) {
    if (cargaP) return cargaP;
    cargaP = fetch(path || '/app/calles-pergamino.json').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (a) { CALLES = Array.isArray(a) ? a : []; IDX = null; return CALLES; })
      .catch(function () { CALLES = []; return CALLES; });
    return cargaP;
  }
  global.Callejero = { cargar: cargar, resolver: resolver, opciones: function () { return CALLES.slice(); }, cargado: function () { return CALLES.length > 0; } };
})(typeof window !== 'undefined' ? window : globalThis);
