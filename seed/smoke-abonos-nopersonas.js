// Smoke CRÍTICO — generarAbonos NO debe leer `personas` (el contable no puede, y leería dato clínico).
// Extrae el cuerpo REAL de generarAbonos y grepea: cero 'personas', y usa el denorm socios.nombreVista.
const { lines, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L=lines('app/index.html');
const src=L.join('\n');                 // archivo completo (para el check del botón genBtn)
const body=fn(L, 'generarAbonos');      // cuerpo de la función por nombre

let ok=0, fail=0; const t=(l,c,x)=>{ (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l}${x?' → '+x:''}`); };

// 1) NINGUNA referencia a personas en CÓDIGO (se ignoran los comentarios //)
const bodyCode=body.split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n');
const refsPersonas=(bodyCode.match(/personas/g)||[]).length;
t('generarAbonos NO menciona `personas` en código (cero, sin contar comentarios)', refsPersonas===0, refsPersonas+' refs');
t("generarAbonos NO hace collection('personas')", !/collection\('personas'\)/.test(bodyCode));
// 2) usa el denorm de socios
t('generarAbonos lee el nombre de socio.nombreVista', /socio\.nombreVista/.test(bodyCode));
// 3) sigue escribiendo el abono (no rompimos la función)
t("generarAbonos sigue escribiendo abonos", /collection\('abonos'\)\.add/.test(bodyCode));
// 4) gate del botón GENERAR ABONOS: facturar (no puedeConfig) — regex sobre el botón específico de abonos
t("botón GENERAR ABONOS gateado por 'facturar' (no puedeConfig)", /const genBtn *= *puede\('facturar'\) *\? *`<button[^`]*onclick="generarAbonos\(\)"/.test(src));

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
