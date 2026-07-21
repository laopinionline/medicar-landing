// Smoke F2 — mapa de alias + direcciones. EJECUTA calleCanon/resolverCalleId (extraídas por nombre) contra el
// callejero REAL. Verifica: (1) el mecanismo pliega variante→canónico; (2) CALLE_ALIAS bien formado (sin ciclos,
// slugs válidos del callejero, clave≠valor); (3) round-trip área↔episodio en el MISMO calleId; (4) fuera-callejero→null.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { lines, fns, konst } = require('./lib/extract');
const L = lines('app/index.html');

const CALLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'calles-pergamino.json'), 'utf8'));
const src = konst(L, 'CALLE_ALIAS') + '\n' +
  fns(L, ['geoStripAccents', 'geoNormStreet', 'normalizarDireccion', 'calleSlug', 'callesIndex', 'resolverCalleId', 'calleCanon']);

const sb = { S: { callesPergamino: CALLES }, console };
vm.createContext(sb);
vm.runInContext(src, sb);
const R = (dom) => vm.runInContext(`resolverCalleId(${JSON.stringify(dom)})`, sb);
const canon = (s) => vm.runInContext(`calleCanon(${JSON.stringify(s)})`, sb);
const ALIAS = vm.runInContext('CALLE_ALIAS', sb);

// espacio de slugs REAL del callejero (para validar que las entradas del mapa existen)
const slugSet = new Set(CALLES.map(n => vm.runInContext(`calleSlug(${JSON.stringify(n)})`, sb)));

let ok = 0, fail = 0;
const t = (label, cond, extra='') => { cond ? ok++ : fail++; console.log(`${cond?'✓':'✗ FALLO'} ${label}${extra?' → '+extra:''}`); };

// ---------- A. mecanismo calleCanon (independiente de los pares debatidos) ----------
t('A1 calleCanon identidad si no hay alias', canon('avenida-carlos-pellegrini') === 'avenida-carlos-pellegrini');
t('A2 calleCanon(null)→null, (\'\')→null', canon(null) === null && canon('') === null);

// ---------- B. CALLE_ALIAS bien formado ----------
{
  const keys = Object.keys(ALIAS), vals = Object.values(ALIAS);
  const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  t('B1 todas las claves son slugs válidos', keys.every(k => slugRe.test(k)), keys.length + ' claves');
  t('B2 todos los valores son slugs válidos', vals.every(v => slugRe.test(v)));
  t('B3 clave ≠ valor (no auto-alias)', keys.every(k => ALIAS[k] !== k));
  t('B4 SIN cadenas/ciclos (ningún valor es a su vez clave)', vals.every(v => !(v in ALIAS)));
  const claveFuera = keys.filter(k => !slugSet.has(k));
  const valorFuera = vals.filter(v => !slugSet.has(v));
  t('B5 toda clave existe en el callejero', claveFuera.length === 0, claveFuera.join(',') || 'ok');
  t('B6 todo canónico existe en el callejero', valorFuera.length === 0, valorFuera.join(',') || 'ok');
  t('B7 idempotente: canon(canon(x))==canon(x)', keys.every(k => canon(canon(k)) === canon(k)));
}

// ---------- C. resolución real: el alias verdadero pliega en el episodio ----------
{
  const mi = R('Mitre 1234'), bm = R('Bartolomé Mitre 1234');
  t('C1 "Mitre 1234" pliega a bartolome-mitre', mi.calleId === 'bartolome-mitre', JSON.stringify(mi));
  t('C2 "Bartolomé Mitre 1234" → mismo calleId', bm.calleId === 'bartolome-mitre', JSON.stringify(bm));
  t('C3 Mitre y Bartolomé Mitre → MISMO calleId (no se factura a un cubierto)', mi.calleId === bm.calleId && mi.altura === bm.altura);
}

// ---------- D. round-trip área ↔ episodio (misma función resolverCalleId por construcción) ----------
{
  // área declara "Mitre 500"; episodio llega tipeado "bartolome mitre 500" (minúsculas, variante larga)
  const area = R('Mitre 500');                 // lo que guardaría empDirAgregar
  const epi  = R('bartolome mitre 500');        // lo que guardaría el despacho
  t('D1 área "Mitre 500" y episodio "bartolome mitre 500" matchean (calleId+altura)',
    area.calleId && area.calleId === epi.calleId && area.altura === epi.altura, `${JSON.stringify(area)} == ${JSON.stringify(epi)}`);
}

// ---------- E. fuera del callejero / ambigua → calleId null (se permite, con ⚠) ----------
{
  const nueva = R('Calle Loteo Nuevo Sin Registrar 100');
  t('E1 calle fuera del callejero → calleId=null, altura=100 (se admite con ⚠)', nueva.calleId === null && nueva.altura === 100, JSON.stringify(nueva));
  const amb = R('Belgrano 800');
  t('E2 calle ambigua (Belgrano/Pasaje Belgrano) → calleId=null', amb.calleId === null, JSON.stringify(amb));
}

console.log(`\n${fail ? '✗' : '✓'} smoke-f2-alias: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
