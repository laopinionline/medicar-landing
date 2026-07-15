// Smoke — N3: el texto de las push de turno SOLO usa fecha/hora/médico/nombreVista. NADA clínico.
const { textoAvisoTurno, textoRecordatorioTurno, fechaLegible } = require('../functions/push-turno');
let ok=0, fail=0; const t=(l,c,x)=>{ (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l}${x?' → '+x:''}`); };

// turno con campos CLÍNICOS inyectados (que NO deben aparecer en el texto)
const turno = {
  fecha:'2099-07-15', hora:'10:30', medicoNombre:'Dr. Martín Suárez', nombreVista:'Pérez, Ana',
  // basura clínica que NO puede filtrarse:
  motivo:'DOLOR_ABDOMINAL', news2:99, nivel:'ROJO', codigoPresuntivo:'amarillo', desenlace:'internacion', score:7
};
const CLINICOS = ['DOLOR_ABDOMINAL','99','ROJO','amarillo','internacion','motivo','news2','nivel','score','desenlace'];

for(const [nombre, fn] of [['aviso', textoAvisoTurno],['recordatorio', textoRecordatorioTurno]]){
  const { title, body } = fn(turno);
  const full = title+' '+body;
  t(`${nombre}: incluye fecha (Mié 15/07)`, /Mié 15\/07/.test(body));
  t(`${nombre}: incluye hora (10:30)`, /10:30/.test(body));
  t(`${nombre}: incluye médico`, /Dr\. Martín Suárez/.test(body));
  t(`${nombre}: incluye nombreVista del destino`, /Pérez, Ana/.test(body));
  const filtrado = CLINICOS.filter(c=>full.includes(c));
  t(`★ ${nombre}: NO interpola NADA clínico`, filtrado.length===0, filtrado.length?('¡FILTRÓ! '+filtrado.join(',')):'limpio');
}

// bordes de fechaLegible
t('fechaLegible fecha inválida → devuelve el string', fechaLegible('xx')==='xx');
t('fechaLegible vacío → ""', fechaLegible('')==='');
// médico ausente → fallback sin romper
t('sin médico → fallback "tu médico"', /tu médico/.test(textoAvisoTurno({fecha:'2099-01-01',hora:'09:00'}).body));

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
