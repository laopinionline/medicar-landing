// Smoke Autogestión de plan — diff de coberturas (ganada/mantenida/perdida), carencia diferenciada, y la
// decisión del enforcement financiero (cobertura en carencia al momento del episodio → se cobra).
const { diffCoberturas, nuevaCarencia, coberturasEnCarencia, DIA_MS } = require('../functions/plan');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };
const eq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

// coberturas: {prestacionId:bool}. viejo cubre A,B. nuevo cubre B,C.
const viejo = { A: true, B: true, X: false };
const nuevo = { B: true, C: true };
const d = diffCoberturas(viejo, nuevo);
t('diff: ganadas = [C] (en nuevo, no en viejo)', eq(d.ganadas, ['C']), JSON.stringify(d.ganadas));
t('diff: mantenidas = [B] (en ambos)', eq(d.mantenidas, ['B']), JSON.stringify(d.mantenidas));
t('diff: perdidas = [A] (en viejo, no en nuevo)', eq(d.perdidas, ['A']), JSON.stringify(d.perdidas));
t('diff: X (cobertura false) no cuenta como cubierta', !d.ganadas.includes('X') && !d.mantenidas.includes('X'));

// ── carencia diferenciada ──
const NOW = 1000000000;
// upgrade: viejo cubre A; nuevo cubre A,B,C con carenciaDias 30. B y C ganadas → carencia; A mantenida → sin carencia.
const carUp = nuevaCarencia({}, { A: true }, { A: true, B: true, C: true }, 30, NOW);
t('★ UPGRADE: ganadas B,C → carencia = now+30d', carUp.B === NOW + 30 * DIA_MS && carUp.C === NOW + 30 * DIA_MS);
t('★ UPGRADE: mantenida A → SIN carencia (no re-carencia)', carUp.A === undefined);

// downgrade: viejo cubre A,B,C; nuevo cubre A. Nada ganado → carencia vacía (inmediato).
const carDown = nuevaCarencia({}, { A: true, B: true, C: true }, { A: true }, 30, NOW);
t('★ DOWNGRADE: nada ganado → carencia vacía (inmediato)', Object.keys(carDown).length === 0, JSON.stringify(carDown));

// lateral: viejo A,B; nuevo B,C (gana C, pierde A, mantiene B). Solo C en carencia.
const carLat = nuevaCarencia({}, { A: true, B: true }, { B: true, C: true }, 15, NOW);
t('★ LATERAL: solo la ganada C en carencia; B mantenida sin carencia; A fuera', carLat.C === NOW + 15 * DIA_MS && carLat.B === undefined && carLat.A === undefined, JSON.stringify(carLat));

// carenciaDias 0 → inmediato (la ganada NO entra).
t('carenciaDias 0 → ganada inmediata (sin carencia)', Object.keys(nuevaCarencia({}, {}, { Z: true }, 0, NOW)).length === 0);

// mantenida con carencia VIVA de un cambio previo → se conserva.
const prev = { B: NOW + 10 * DIA_MS }; // B ya estaba en carencia hasta now+10d
const carConserva = nuevaCarencia(prev, { B: true }, { B: true, C: true }, 30, NOW);
t('mantenida B con carencia viva previa → se CONSERVA (no se pisa)', carConserva.B === NOW + 10 * DIA_MS);
t('  y la ganada C toma la nueva carencia', carConserva.C === NOW + 30 * DIA_MS);
// mantenida con carencia VENCIDA → no entra.
t('mantenida con carencia vencida → NO entra (sin residuo)', nuevaCarencia({ B: NOW - 1 }, { B: true }, { B: true }, 30, NOW).B === undefined);

t('coberturasEnCarencia lista las futuras', eq(coberturasEnCarencia({ B: NOW + 5 * DIA_MS, A: NOW - 1 }, NOW), ['B']));

// ── enforcement financiero (réplica de la decisión de resolverAtribucion + generarCargos) ──
// Al crear el episodio: enCarencia = coberturas cubiertas por el plan Y con carencia > fechaEpisodio.
function enCarenciaAlEpisodio(coberturas, carenciaPorCobertura, epMs) {
  return Object.keys(coberturas || {}).filter(k => (coberturas || {})[k] === true && (carenciaPorCobertura[k] || 0) > epMs);
}
// En generarCargos: no cubierto → fuera_cobertura; cubierto + en carencia → en_carencia (cobra); cubierto sin carencia → sin cargo.
function reglaCargo(coberturas, enCar, prestacionId) {
  if (coberturas[prestacionId] !== true) return 'fuera_cobertura';
  if (enCar.includes(prestacionId)) return 'en_carencia';
  return 'sin_cargo';
}
const cob = { A: true, B: true };                 // el plan cubre A y B
const carPC = { B: NOW + 5 * DIA_MS };            // B en carencia hasta now+5d
const epEnCar = NOW + 1 * DIA_MS;                 // episodio DENTRO de la carencia de B
const epPost = NOW + 10 * DIA_MS;                 // episodio DESPUÉS de la carencia de B
const enCar1 = enCarenciaAlEpisodio(cob, carPC, epEnCar);
t('★ episodio en carencia de B → B se cobra (en_carencia), A cubierta', reglaCargo(cob, enCar1, 'B') === 'en_carencia' && reglaCargo(cob, enCar1, 'A') === 'sin_cargo');
const enCar2 = enCarenciaAlEpisodio(cob, carPC, epPost);
t('★ episodio DESPUÉS de la carencia → B ya cubierta (sin_cargo)', reglaCargo(cob, enCar2, 'B') === 'sin_cargo');
t('★ prestación fuera del plan → fuera_cobertura (siempre cobra)', reglaCargo(cob, enCar1, 'Z') === 'fuera_cobertura');

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
