'use strict';
// Smoke — banderas-rojas.js (MEDICAR IA). El escaneo determinista que decide la urgencia 443044. Casos REALES:
// rojos (deben disparar, incluso oblicuos) y benignos/administrativos (NO deben disparar). node seed/smoke-banderas-rojas.js
const { escanear } = require('../functions/banderas-rojas');
let ok = 0, fail = 0;
const rojo = (l, txt) => { const r = escanear(txt).rojo; console.log(`${r ? '✓' : '✗ FALLO'} ROJO   ${l}`); r ? ok++ : fail++; };
const verde = (l, txt) => { const r = escanear(txt).rojo; console.log(`${!r ? '✓' : '✗ FALLO'} verde  ${l}${r ? ' (disparó ' + escanear(txt).matched.join(',') + ')' : ''}`); !r ? ok++ : fail++; };

console.log('\n— ROJOS (deben disparar) —');
rojo('dolor de pecho', 'Tengo un dolor fuerte en el pecho hace media hora');
rojo('falta de aire', 'me cuesta respirar y me falta el aire');
rojo('desmayo directo', 'me desmayé en la cocina');
rojo('desmayo oblicuo/ya pasó', 'quería ver mi factura, igual hoy me desmayé un rato pero ya se me pasó');
rojo('pérdida de conocimiento', 'mi marido perdió el conocimiento');
rojo('sangrado', 'estoy sangrando mucho por la nariz y no para');
rojo('convulsión', 'al nene le agarró una convulsión');
rojo('neuro (habla/cara)', 'se me traba la lengua y siento media cara dormida');
rojo('no mueve el brazo', 'no puedo mover el brazo izquierdo de golpe');
rojo('inconsciente', 'no reacciona y no responde');
rojo('autolesión', 'ya no quiero vivir, me quiero morir');
rojo('cefalea súbita', 'el peor dolor de cabeza de mi vida, apareció de golpe');
rojo('obstétrico', 'estoy embarazada y perdí líquido');
rojo('mayúsculas/acentos', 'DOLOR DE PECHO y no puedo respirar');

console.log('\n— VERDES (NO deben disparar) —');
verde('consulta plan', '¿qué cubre mi plan?');
verde('factura', '¿cuánto debo y para cuándo?');
verde('cambio de plan', 'somos 4 en casa, ¿me conviene cambiar de plan?');
verde('garganta leve', 'tengo la garganta un poco irritada y algo de mocos');
verde('turno', '¿cómo pido un turno por videollamada?');
verde('resfrío común', 'estoy resfriado, con un poco de tos');
verde('dolor leve muscular', 'me duele un poco la espalda de dormir mal');
verde('fuera de tema', 'contame un chiste');

// falso-positivo tolerado por diseño (error hacia escalar): lo dejamos documentado, no lo forzamos.
console.log('\n— nota: el diseño acepta falsos positivos (error hacia derivar). Los VERDE de arriba son los que importan. —');

console.log(`\n${fail ? '✗' : '✓'} smoke-banderas-rojas: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
