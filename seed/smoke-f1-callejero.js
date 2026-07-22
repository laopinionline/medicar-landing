// Smoke F1 — callejero canónico. EJECUTA calleSlug/callesIndex/resolverCalleId (extraídas por nombre)
// contra el callejero REAL (app/calles-pergamino.json). Verifica: slug determinista/estable,
// resolución (Mitre / Av-Pellegrini / rural / ambiguo / desconocido) y degradación a null sin JSON.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { lines, fns, konst } = require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L = lines('app/index.html');

// La cadena de canonización tal cual está en producción (F2 sumó calleCanon/CALLE_ALIAS, que resolverCalleId invoca).
const src = konst(L, 'CALLE_ALIAS') + '\n' +
  fns(L, ['geoStripAccents', 'geoNormStreet', 'normalizarDireccion', 'calleSlug', 'callesIndex', 'calleCanon', 'resolverCalleId']);
const CALLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'calles-pergamino.json'), 'utf8'));

function mkSandbox(callesPergamino) {
  const S = { callesPergamino }; // el índice se memoiza en S._callesIdx (igual que producción)
  const sandbox = { S, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

let ok = 0, fail = 0;
const t = (label, cond, extra='') => { cond ? ok++ : fail++; console.log(`${cond?'✓':'✗ FALLO'} ${label}${extra?' → '+extra:''}`); };

// ---------- A. calleSlug: determinismo + estabilidad ----------
{
  const sb = mkSandbox(CALLES);
  const slug = (s) => vm.runInContext(`calleSlug(${JSON.stringify(s)})`, sb);
  t('A1 slug determinista (misma entrada, mismo id)', slug('Bartolomé Mitre') === slug('Bartolomé Mitre'));
  t('A2 slug de "Bartolomé Mitre"', slug('Bartolomé Mitre') === 'bartolome-mitre', slug('Bartolomé Mitre'));
  t('A3 slug de "Mitre" ≠ slug de "Bartolomé Mitre" (no fusiona)', slug('Mitre') !== slug('Bartolomé Mitre'), slug('Mitre'));
  t('A4 slug conserva sufijo "(101)"', slug('Alejandro Ferrari (101)') === 'alejandro-ferrari-101', slug('Alejandro Ferrari (101)'));
  t('A5 slug numérico "9 de Julio"', slug('9 de Julio') === '9-de-julio', slug('9 de Julio'));
  // Estabilidad global: 589 entradas → 589 ids únicos, 0 colisión.
  const ids = new Set(CALLES.map(slug));
  t('A6 589 entradas → 589 ids únicos (0 colisión)', ids.size === CALLES.length, `${ids.size}/${CALLES.length}`);
  t('A7 ningún slug vacío', ![...ids].some(x => !x));
}

// ---------- B. resolverCalleId: resolución con el callejero cargado ----------
{
  const sb = mkSandbox(CALLES);
  const R = (dom) => vm.runInContext(`resolverCalleId(${JSON.stringify(dom)})`, sb);

  // F2: resolverCalleId ahora PLIEGA el alias (calleCanon) → "Mitre" canoniza a bartolome-mitre.
  const mitre = R('Mitre 1234');
  t('B1 "Mitre 1234" → calleId=bartolome-mitre (alias plegado), altura=1234', mitre.calleId === 'bartolome-mitre' && mitre.altura === 1234, JSON.stringify(mitre));

  // tolerancia: "Avenida Carlos Pellegrini" en el callejero; el despachante tipea sin "Avenida" y en minúsculas.
  const pell = R('carlos pellegrini 500');
  t('B2 "carlos pellegrini 500" tolera prefijo/caso → calleId=avenida-carlos-pellegrini', pell.calleId === 'avenida-carlos-pellegrini' && pell.altura === 500, JSON.stringify(pell));
  const pell2 = R('Av. Carlos Pellegrini 500');
  t('B3 "Av. Carlos Pellegrini 500" mismo calleId (Av. se ignora en la búsqueda)', pell2.calleId === 'avenida-carlos-pellegrini', JSON.stringify(pell2));

  // rural → null
  const rural = R('Zona Rural, Ruta 32 km 5');
  t('B4 rural → calleId=null, altura=null', rural.calleId === null && rural.altura === null, JSON.stringify(rural));

  // ambiguo: "Belgrano" y "Pasaje Belgrano" colapsan bajo geoNormStreet → NO adivina.
  const belg = R('Belgrano 800');
  t('B5 "Belgrano 800" ambiguo → calleId=null (no adivina), altura=800 igual', belg.calleId === null && belg.altura === 800, JSON.stringify(belg));

  // desconocido: calle que no existe en el padrón → null, pero conserva altura parseada.
  const desc = R('Calle Inventada Que No Existe 100');
  t('B6 calle inexistente → calleId=null, altura=100', desc.calleId === null && desc.altura === 100, JSON.stringify(desc));

  // sin altura → identifica la calle igual (forward-compat con área "toda la calle X"); F3 igual exige altura para el match puntual
  const sinAlt = R('Mitre');
  t('B7 "Mitre" sin altura → calleId=bartolome-mitre (alias), altura=null (calle identificada, sin nº)', sinAlt.calleId === 'bartolome-mitre' && sinAlt.altura === null, JSON.stringify(sinAlt));

  // vacío
  const vac = R('');
  t('B8 domicilio vacío → todo null', vac.calleId === null && vac.altura === null, JSON.stringify(vac));
}

// ---------- C. degradación: callejero NO cargado → calleId siempre null (fallback honesto) ----------
{
  const sb = mkSandbox([]); // S.callesPergamino=[] simula "el JSON no cargó todavía en la emergencia"
  const R = (dom) => vm.runInContext(`resolverCalleId(${JSON.stringify(dom)})`, sb);
  const mitre = R('Mitre 1234');
  t('C1 sin JSON: "Mitre 1234" → calleId=null (nunca throw), altura=1234 conservada', mitre.calleId === null && mitre.altura === 1234, JSON.stringify(mitre));
  t('C2 sin JSON: no memoiza índice vacío (S._callesIdx sigue sin fijarse)', sb.S._callesIdx === undefined);
}

// ---------- D. la ambigüedad se detecta sola (no hardcodeada) ----------
{
  const sb = mkSandbox(CALLES);
  vm.runInContext('callesIndex();', sb); // fuerza construcción
  const idx = sb.S._callesIdx;
  const ambiguas = [...idx.entries()].filter(([k, v]) => v === null).map(([k]) => k);
  t('D1 el índice memoizó (callejero cargado; 589 entradas → 581 claves de búsqueda)', idx && typeof idx.get === 'function' && idx.size === 581, `size=${idx&&idx.size}`);
  t('D2 detecta 8 claves ambiguas (colisiones geoNormStreet)', ambiguas.length === 8, `${ambiguas.length}: ${ambiguas.join(' | ')}`);
  t('D3 "BELGRANO" está entre las ambiguas', ambiguas.includes('BELGRANO'));
}

console.log(`\n${fail ? '✗' : '✓'} smoke-f1-callejero: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
