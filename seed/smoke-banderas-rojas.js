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

console.log('\n— NEGACIÓN: supresión CONSERVADORA (solo negación limpia y adyacente) —');
// DEBEN suprimir (negación inequívoca y adyacente, sin ambigüedad):
verde('negado limpio: "no me falta el aire"', 'no me falta el aire');
verde('negado limpio: "ya no me duele el pecho"', 'ya no me duele el pecho');
verde('negado limpio: "ya no me falta el aire, estoy bien"', 'ya no me falta el aire, estoy bien');
verde('negado limpio: "no me duele el pecho"', 'no me duele el pecho');

console.log('\n— NEGACIÓN: casos que DEBEN SEGUIR DISPARANDO (ambigüedad/contraste/duda) —');
rojo('ambiguo "no sé si es dolor de pecho pero me duele"', 'no sé si es dolor de pecho pero me duele');
rojo('hedge "no me falta tanto el aire"', 'no me falta tanto el aire');
rojo('contraste "no fue un desmayo pero me mareé mucho"', 'no fue un desmayo pero me mareé mucho');
rojo('temporal "no me duele el pecho ahora, pero antes sí"', 'no me duele el pecho ahora, pero antes sí');
rojo('"no" NO adyacente: "no fue nada, un dolor de pecho fuerte"', 'no fue nada, un dolor de pecho fuerte');
rojo('"no puedo respirar" (no INTRÍNSECO al síntoma)', 'no puedo respirar');

// nota: error hacia ESCALAR — la supresión solo aplica a la negación limpia y adyacente; ante duda, dispara.

console.log('\n— COBERTURA (misses del recon: morfología + sinónimos por categoría) —');
// dolor_pecho por proximidad (gerundio, presión/ardor torácico, brazo, borde de ventana)
rojo('MISS en vivo: gerundio "doliendo el pecho fuerte"', 'me está doliendo el pecho fuerte');
rojo('MISS en vivo: "presión fuerte en el pecho" (presentación de infarto)', 'siento una presión fuerte en el pecho');
rojo('ardor torácico "me arde el pecho"', 'me arde el pecho');
rojo('MISS verif indep: "un fuego acá en el pecho"', 'tengo como un fuego acá en el pecho');
rojo('"quemazón en el pecho"', 'siento una quemazón en el pecho');
rojo('opresión "tengo el pecho apretado"', 'tengo el pecho apretado');
rojo('borde de ventana ~30: "me duele muchísimo y fuerte el pecho"', 'me duele muchísimo y fuerte el pecho');
rojo('pecho + brazo izquierdo', 'me duele el pecho y el brazo izquierdo');
// falta_aire (gerundios + sinónimos)
rojo('gerundio "me está costando respirar"', 'me está costando respirar');
rojo('sinónimo "me agito mucho"', 'me agito mucho');
rojo('"me quedo sin aire"', 'me quedo sin aire');
rojo('"respiro con dificultad"', 'respiro con dificultad');
rojo('"no me entra aire" (sin el)', 'no me entra aire');
// desmayo (mareo + caída)
rojo('mareo+caída "me mareé y casi me caigo"', 'me mareé y casi me caigo');
rojo('coloquial "se me fue la cabeza y caí"', 'se me fue la cabeza y caí');
// neuro / dolor_subito
rojo('facial "se me dobló la cara"', 'se me dobló la cara');
rojo('crisis hipertensiva "mi presión es 19/11 y me duele la cabeza"', 'mi presión es 19/11 y me duele la cabeza');
rojo('crisis "la presión por las nubes"', 'tengo la presión por las nubes');
rojo('cefalea en trueno "puntada terrible de golpe en la cabeza"', 'me agarró una puntada terrible de golpe en la cabeza');

console.log('\n— TRAMPAS DE REGRESIÓN: presión/arde SIN pecho → deben seguir VERDE —');
verde('presión ARTERIAL (admin)', 'quiero saber mi presión arterial');
verde('"me tomé la presión, dio 12/8"', 'me tomé la presión, dio 12/8');
verde('"me arde un poco la garganta" (arde ≠ pecho)', 'me arde un poco la garganta');
verde('"me duele la espalda de dormir mal"', 'me duele un poco la espalda de dormir mal');
verde('"molestia en la panza"', 'tengo una molestia en la panza');
verde('fuego SIN pecho "se prendió fuego la cocina"', 'se prendió fuego la cocina');
verde('presión NORMAL "me tomé la presión, dio 12/8"', 'me tomé la presión, dio 12/8');
verde('fecha "nos vemos el 19/11" (no es presión)', 'nos vemos el 19/11 en la clínica');

console.log('\n— URGENCIA DECLARADA POR TIEMPO (inmediatez + atención médica, sin síntoma) → ROJO —');
rojo('objetivo: "hoy mismo lo vea un médico a mi nene"', 'necesito que hoy mismo lo vea un médico a mi nene');
rojo('"quiero que me vea un médico ya"', 'quiero que me vea un médico ya');
rojo('"necesito que ahora lo atiendan, no puede esperar"', 'necesito que ahora lo atiendan, no puede esperar');
rojo('"urgente, que lo vea un médico"', 'es urgente, que lo vea un médico por favor');
rojo('"lo necesito ver por un médico cuanto antes"', 'lo necesito ver por un médico cuanto antes');

console.log('\n— TRAMPAS DE REGRESIÓN de la urgencia declarada → deben seguir VERDE —');
verde('agenda: "¿puedo pedir turno para hoy?"', '¿puedo pedir turno para hoy?');
verde('agenda con médico: "¿tienen turno con un médico para hoy mismo?"', '¿tienen turno con un médico para hoy mismo?');
verde('cita: "quiero pedir una cita, ¿hay para hoy?"', 'quiero pedir una cita, ¿hay para hoy?');
verde('sin plazo: "quiero que me vea un médico" (va a turno)', 'quiero que me vea un médico');
verde('negación/sin ancla: "lo urgente ya pasó"', 'lo urgente ya pasó');
verde('medicamento ≠ médico: "necesito un medicamento ya"', 'necesito un medicamento ya');
verde('inmediatez sin atención médica: "ahora quiero cambiar mi plan"', 'ahora quiero cambiar mi plan');
verde('info de guardia: "¿la guardia atiende hoy?" (sin pronombre+atiend)', '¿la guardia atiende hoy?');
verde('disponibilidad: "¿hay guardia médica disponible para hoy a la tarde?"', '¿hay guardia médica disponible para hoy a la tarde?');
verde('cobertura urgencias (admin): "¿mi plan cubre urgencias ahora mismo?"', '¿mi plan cubre urgencias ahora mismo?');
verde('atención administrativa: "que me atienda alguien de administración ya"', 'quiero que me atienda alguien de administración ya');

console.log(`\n${fail ? '✗' : '✓'} smoke-banderas-rojas: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
