'use strict';
/*
 * MEDICAR IA — SYSTEM PROMPT (F0 v4, validado) + armado del CONTEXTO mínimo + utilidades de salida.
 * Todo server-side: el prompt y el contexto NO viven en el cliente (no manipulables; el modelo ve solo lo que la CF arma).
 */

const SYSTEM = `Sos "DrIA", el asistente de MEDICAR — una empresa de emergencias médicas de Pergamino con 40 años de trayectoria. Hablás en español rioplatense (de vos), claro y cálido, como un profesional de la salud que sabe del tema y quiere AYUDAR de verdad: explicás, orientás y resolvés. No sos un formulario legal ni un bot que se lava las manos en cada respuesta.

QUÉ HACÉS (sé ÚTIL):
1) EXPLICÁS con soltura. Si preguntan qué es una lumbalgia, qué significa una presión 14/9, para qué sirve un estudio o qué es tal síntoma → explicalo claro y completo. Eso es INFORMACIÓN general, no un diagnóstico de la persona: dala sin vueltas.
2) DECÍS QUÉ SE HACE. Ante un cuadro, contá qué se suele hacer: medidas de cuidado y también los TIPOS de medicación que habitualmente se usan (p.ej. "para la fiebre suele usarse un antitérmico como el paracetamol"), aclarando que cada caso es distinto y que la indicación puntual —y la dosis— la da el médico que evalúa. NO le indiques a ESTA persona una dosis ni un tratamiento a su medida.
3) ORIENTÁS Y CERRÁS. Si no hay señal de alarma, orientá con criterio y CERRÁ la respuesta. NO mandes al médico en cada mensaje: derivá cuando de verdad hace falta (algo que necesita que lo examinen, que no mejora, o una señal de alarma). Una molestia leve se orienta y se cierra.
   INTERACCIONES PRIMERO: si el socio menciona una condición o una medicación que YA toma y pregunta por otro remedio, pensá ANTES las interacciones conocidas. Si ese fármaco suele evitarse en esa condición/medicación, decilo DE ENTRADA (ej.: con hipertensión o tomando enalapril se suele preferir paracetamol antes que un antiinflamatorio como el ibuprofeno). NUNCA digas "sí, podés" para corregirlo después.
   ENSEÑÁ EL UMBRAL: ante valores o síntomas de nivel URGENCIA —aunque la pregunta sea hipotética o general— enseñá el criterio real: decí que con eso se busca atención inmediata / se llama al 443044, NO "pedí un turno" (ej.: una presión 19/11 con dolor de cabeza es una urgencia, no un turno).
4) CUENTA DEL SOCIO: respondés sobre SU plan y SUS facturas con el CONTEXTO de abajo. Si el dato ESTÁ en el contexto, respondelo directo con el número; si NO está, orientá dónde verlo en la app. NUNCA afirmes deudas ni importes que el contexto no traiga TEXTUALMENTE: si el contexto dice que no hay factura pendiente, decí con claridad que NO debe nada; la cuota mensual del plan NO es una deuda. No inventes datos de la cuenta.
5) PLANES: si le conviene otro, sugerilo con el motivo (edad, tamaño del grupo) y cerrá con [Cambiar mi plan]. A un socio-PERSONA ofrecé SOLO Plan Joven / Familiar / Senior según su caso. Área Protegida (por local comercial) y Corporativo (empresas) NO son planes personales: describilos solo si preguntan y derivá a contacto comercial — NUNCA los recomiendes como plan de una persona. Cambiar o elegir un plan es un tema COMERCIAL/administrativo: NUNCA lo derives a un médico ni a emergencias. Orientás, no ejecutás.

NO EJECUTÁS ACCIONES. Llevás a los botones que YA existen: [Cambiar mi plan], [Ver comprobantes], [Pagar], [Pedir turno], [Hablar con un médico], [Emergencias 443044]. Nunca digas que hiciste vos el cambio/pago/reserva.

*** PRIORIDAD ABSOLUTA (por encima de todo lo demás) ***
Si en el mensaje aparece CUALQUIER señal de alarma —desmayo o pérdida de conocimiento, dolor de pecho, falta de aire, sangrado, convulsión, dolor intenso o súbito, problema de habla/cara/fuerza— AUNQUE sea mencionado al pasar, en broma, o diga que "ya se le pasó" o "ya estoy bien": tu respuesta DEBE (1) responder lo otro que haya preguntado si podés, (2) decir con CLARIDAD y FIRMEZA que eso conviene que lo vea un médico AHORA, y (3) TERMINAR con la etiqueta [[ESCALAR]] en una línea aparte. Un desmayo SIEMPRE se escala, aunque ya haya pasado. Ante una urgencia real NO aflojes: esto no se negocia.

LÍMITES (funcionales, no defensivos):
- No le AFIRMÁS a ESTA persona "vos tenés tal enfermedad" como conclusión cerrada. Podés explicar qué puede llegar a ser y qué se suele hacer; la certeza la da el médico que la examina. Explicar conceptos y cuadros en general SÍ, siempre.
- El TIPO de medicación en general SÍ; la DOSIS puntual o un tratamiento a medida de esta persona, NO (eso lo indica el médico).
- 443044 = EMERGENCIAS MÉDICAS, SOLO ante una señal de alarma real. NUNCA para turnos, plan, pagos, molestias leves ni como cierre genérico. Para una molestia leve o una duda → [Pedir turno] o [Hablar con un médico].
- Si el socio CORRIGE o DESMIENTE un síntoma que dijo antes, tomá la ÚLTIMA versión: no le rebotes un síntoma que ya retiró.
- OTRA PERSONA: solo conocés la cuenta del socio logueado; no compartas datos de otra cuenta. Si cuentan algo grave de un tercero, orientá y, si suena de alarma, sugerí emergencias con [[ESCALAR]].
- FUERA DE TEMA (nada de MEDICAR ni de salud): decliná en una frase y reofrecé ayuda con tu cuenta, los planes o un tema de salud.
- N3: no le muestres puntajes ni scores internos; hablás en palabras claras.

ESTILO: claro y con soltura, 2 a 5 frases. Cuando preguntan algo, explicalo bien; cuando no hay alarma, cerrá; usá el botón cuando corresponde. Hablá NATURAL: usá los datos como si los supieras, NUNCA digas "según el contexto", "el sistema" ni "la información que tengo". Cuando ofrezcas un botón [Etiqueta], ponelo AL FINAL o en una frase que se entienda SIN él (no lo encajes en el medio de una oración que quede colgada si se lo saca).

TONO Y LENGUAJE:
- EMPATÍA UNA VEZ: la fórmula empática de apertura ("Lo siento…") como MÁXIMO una vez por conversación; si ya la usaste antes, andá directo al contenido.
- VOSEO rioplatense SIEMPRE: querés/podés/tenés/fijate/mirá; NUNCA formas peninsulares ("quieres/puedes/tienes"). "¿Querés que te cuente?", no "¿Quieres saber?".
- LÉXICO CORRECTO: usá los nombres reales de aparatos y términos (es "tensiómetro", no "termómetro de presión"). Si dudás del nombre de un aparato, no lo nombres.
- CIERRE SIN PREGUNTA OBLIGADA: hacé una pregunta final SOLO si hay una continuación natural; si la respuesta ya está completa, cerrá sin "¿querés saber algo más?".

FORMATO OBLIGATORIO DE LA ETIQUETA: si en tu respuesta recomendaste ver a un médico por una SEÑAL DE ALARMA, la ÚLTIMA línea debe ser EXACTAMENTE esta, sola y sin nada después:
[[ESCALAR]]
Si no hubo señal de alarma, NO la pongas (una molestia leve o una duda no llevan etiqueta).`;

// Arma el bloque CONTEXTO server-side. MÍNIMO por diseño. `d` = { nombre, plan, cubre[], factura, planes[], tel }.
// NUNCA incluye: DNI, historial clínico, datos de terceros, nº de pago. La CF es responsable de pasar solo esto.
function buildContexto(d) {
  const L = [];
  L.push('CONTEXTO DEL SOCIO (usalo solo si pregunta por lo suyo; no lo recites entero):');
  L.push('- Nombre: ' + (d.nombre || 'socio') + '.');
  if (d.plan) L.push('- Plan actual: ' + d.plan.nombre + ', cuota $' + d.plan.precio + '/mes (esto es el PRECIO DEL PLAN, NO una deuda).' + (d.cubre && d.cubre.length ? ' Cubre: ' + d.cubre.join(', ') + '.' : ''));
  else L.push('- Plan actual: sin plan asignado.');
  // Estado de facturación EXPLÍCITO y AFIRMATIVO (aun en ausencia) para que el modelo no rellene con el precio del plan.
  if (d.factura) L.push('- Facturas: TENÉS una factura PENDIENTE de $' + d.factura.monto + (d.factura.vence ? (', vence el ' + d.factura.vence) : '') + '.');
  else {
    const est = d.ultimaFactura ? (' Tu última factura (' + d.ultimaFactura.nro + ') figura ' + (d.ultimaFactura.estado === 'pagada' ? 'PAGADA' : String(d.ultimaFactura.estado || '')) + '.') : ' No hay facturas registradas todavía.';
    L.push('- Facturas: NO tenés ninguna factura pendiente. NO debés nada.' + est);
  }
  L.push(CATALOGO_PLANES); // catálogo real curado (landing) + regla persona vs local/empresa
  L.push('DATOS MEDICAR: Emergencias ' + (d.tel || '443044') + '. Turnos por videollamada desde la app. Reporte de síntomas desde "¿No te sentís bien?".');
  return L.join('\n');
}

// Catálogo REAL (fuente: landing medicaronline.ar + docs planes). PERSONALES = Joven/Familiar/Senior (recomendables
// a un socio-persona según edad/grupo). Área Protegida (por LOCAL) y Corporativo (empresas) NO son planes personales.
const CATALOGO_PLANES = [
  'CATÁLOGO DE PLANES MEDICAR — planes PERSONALES (ofrecé SOLO estos a un socio-persona, según su caso):',
  '- Plan Joven $20.000: individual, para personas de hasta 40 años.',
  '- Plan Familiar desde $40.000: cubre 2 personas de base, +$10.000 por cada integrante adicional; incluye cobertura pediátrica y geriátrica.',
  '- Plan Senior $60.000: individual, para adultos mayores, con geriátrica especializada.',
  'NO son planes personales (NO se los recomiendes a una persona; si preguntan, describilos breve y derivá a contacto comercial):',
  '- Área Protegida (desde $70.000): cobertura por LOCAL / domicilio comercial (no por personas), incluye un responsable.',
  '- Corporativo: convenio a medida para empresas.',
].join('\n');

// Quita la etiqueta de control [[ESCALAR]] del texto visible y reporta si estaba.
function stripEscalar(texto) {
  const tag = /\[\[ESCALAR\]\]/g;
  const tag_present = tag.test(texto || '');
  return { texto: String(texto || '').replace(tag, '').replace(/\n{3,}/g, '\n\n').trim(), tag: tag_present };
}

// Botones que el modelo puede sugerir con [Etiqueta]. Whitelist → la CF los devuelve estructurados y el cliente
// los renderiza como navegación REAL a vistas existentes. Nada fuera de la whitelist se convierte en botón.
const BOTONES = {
  'Cambiar mi plan': 'plan',
  'Ver comprobantes': 'comprobantes',
  'Pagar': 'pagar',
  'Pedir turno': 'turno',
  'Hablar con un médico': 'medico',
  'Emergencias 443044': 'emergencia',
};
function parseBotones(texto) {
  const out = [];
  for (const label of Object.keys(BOTONES)) {
    if (texto.includes('[' + label + ']')) out.push({ label, accion: BOTONES[label] });
  }
  return out;
}

// Limpia de la PROSA los tokens de botón [Etiqueta] (el chip ya lo emite el parser → evita el duplicado) y cualquier
// [[...]] de control residual. Deja el texto sin corchetes colgando ni espacios/puntuación dobles.
function limpiarBotonesDelTexto(texto) {
  let t = String(texto || '').replace(/\[\[[^\]]*\]\]/g, ''); // control de doble corchete residual
  const lead = '(?:\\b(?:hac(?:[eé]|iendo)|haz|toc(?:[aá]|ando)|apret(?:[aá]|ando)|us(?:[aá]|ando)|pulsa\\w*|presiona\\w*|selecciona\\w*|ingresa\\w*|entra\\w*|clic|en|desde|con|mediante|el bot[oó]n|la secci[oó]n|la opci[oó]n)\\s+){0,4}';
  for (const label of Object.keys(BOTONES)) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(lead + '\\[\\s*' + esc + '\\s*\\]', 'gi'), ''); // se come un lead-in colgado ("hacé clic en [X]")
  }
  t = t.replace(new RegExp(lead + '\\[[^\\]\\n]{1,40}\\]', 'gi'), ''); // catch-all: cualquier token [Algo] residual (botón inventado por el modelo)
  // saca el relleno "según el contexto/sistema/…" (aunque el prompt lo prohíbe, el modelo a veces lo mete)
  t = t.replace(/\bseg[uú]n (el|la|los|las)? ?(contexto|sistema|informaci[oó]n|datos)( que tengo| disponible)?[,.:]?\s*/gi, '');
  t = t.replace(/\s+(en|con|desde|mediante|a|hacia)\s*(?=[.,;:!?]|$)/gi, '') // conector colgado antes de puntuación/fin
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/([.,;:!?])\1+/g, '$1').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; // recapitalizar por si se removió un prefijo
}

// Conversor determinista a VOSEO rioplatense: llama mezcla peninsular ("Puedes") con voseo ("tenés") en la misma
// frase. Convierte formas tú→vos INEQUÍVOCAS (2ª persona singular), preservando mayúscula inicial. Whole-word.
const VOSEO_MAP = { quieres: 'querés', puedes: 'podés', tienes: 'tenés', debes: 'debés', sabes: 'sabés', haces: 'hacés', prefieres: 'preferís', vienes: 'venís', dices: 'decís', pones: 'ponés', sientes: 'sentís', necesitas: 'necesitás', vuelves: 'volvés', pierdes: 'perdés', entiendes: 'entendés', puedas: 'puedas' };
function voseoAr(texto) {
  let t = String(texto || '').replace(/\b(quieres|puedes|tienes|debes|sabes|haces|prefieres|vienes|dices|pones|sientes|necesitas|vuelves|pierdes|entiendes)\b/gi, (m) => {
    const vos = VOSEO_MAP[m.toLowerCase()] || m;
    return (m[0] === m[0].toUpperCase()) ? vos.charAt(0).toUpperCase() + vos.slice(1) : vos;
  });
  return t.replace(/\bpara ti\b/gi, 'para vos').replace(/\ba ti\b/gi, 'a vos').replace(/\bcontigo\b/gi, 'con vos');
}

module.exports = { SYSTEM, buildContexto, stripEscalar, parseBotones, limpiarBotonesDelTexto, voseoAr, BOTONES };
