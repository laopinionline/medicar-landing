// Smoke Referente — núcleo del CÓDIGO (formato legible, sin caracteres ambiguos). Puro, sin Firebase.
// (Reemplaza a smoke-referente-n3.js, retirado al eliminar el binario estado_referido/ponderación.)
const { generarCodigo, esFormatoCodigo, CODE_ALFABETO } = require('../functions/referente');
let ok = 0, fail = 0;
const t = (l, c, x) => { (c ? ok++ : fail++); console.log(`${c ? '✓' : '✗'} ${l}${x !== undefined ? ' → ' + x : ''}`); };

const cod = generarCodigo((n) => n - 1); // determinista: siempre el último char del alfabeto
t('generarCodigo da forma MED-XXXXXX', /^MED-.{6}$/.test(cod), cod);
t('esFormatoCodigo acepta el generado', esFormatoCodigo(cod));
t('el alfabeto NO tiene ambiguos (0/O/1/I/L)', !/[01OIL]/.test(CODE_ALFABETO));
t('esFormatoCodigo rechaza basura', !esFormatoCodigo('MED-000000') && !esFormatoCodigo('hola') && !esFormatoCodigo(''));

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
