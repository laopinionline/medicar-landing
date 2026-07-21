// Smoke de RENDER (lección F-3): ejecuta las piezas nuevas de E-2 con fixtures, no solo compila.
// convenioLbl/Chip, facturarAField/Chip, y empFormEdit (editor contable vs chip read-only afiliados).
const vm = require('vm');
const { lines, fn, fns } = require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L = lines('app/index.html');

const esc         = fn(L, 'esc');
const facMoney    = fn(L, 'facMoney');
const empPlanOpts = fn(L, 'empPlanOpts');
const empFormEdit = fn(L, 'empFormEdit');
const e2helpers   = fns(L, ['convenioLbl', 'convenioChip', 'facturarAField', 'facturarAChip', 'empConvErr', 'empConvModoChange']);

const stubs = `
  const S = __S__;
  function puedeConfig(){ return __CFG__; }
`;
const src = `${esc}\n${facMoney}\n${empPlanOpts}\n${stubs}\n${e2helpers}\n${empFormEdit}\n`;

const EMP_FIJO = { id:'eA', razonSocial:'ACME', cuit:'20-1', tipo:'corporativo', numeroConvenio:'30703', activo:true, planIdDefault:null, convenio:{ modo:'fijo', montoMensual:80000 } };
const EMP_SIN  = { id:'eB', razonSocial:'Beta', cuit:'20-2', tipo:'corporativo', numeroConvenio:'30704', activo:true, planIdDefault:null };
const afState  = { empresas:[EMP_FIJO, EMP_SIN], planes:[{id:'p1',nombre:'Plan 1'}] };

function run(label, cfg, fn, checks){
  try{
    const sandbox = { console, __S__:{ af:afState, user:{uid:'u1'} }, __CFG__:cfg };
    const r = vm.runInNewContext(`(function(){\n${src}\n return (${fn});\n})()`, sandbox, { timeout: 3000 });
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    console.log(`✓ ${label} → string(${r.length}) ${checks?checks(r):''}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok=0, fail=0; const t=(b)=>b?ok++:fail++;

t(run('A convenioLbl fijo/per_capita/none', true, `convenioLbl({modo:'fijo',montoMensual:80000})+'|'+convenioLbl({modo:'per_capita'})+'|'+convenioLbl(null)`,
  r => `[${r.includes('fijo $80.000')} · ${r.includes('per cápita')} · ${r.includes('— sin cargar')}]`));
t(run('B convenioChip set/unset', true, `convenioChip({modo:'fijo',montoMensual:80000})+convenioChip(null)`,
  r => `[set:${/\$80\.000/.test(r)} · unset:${/sin cargar/.test(r)}]`));
t(run('C facturarAField persona (default, grp oculto, empresas en selector)', true, `facturarAField(null,'af-facturara')`,
  r => `[personaSel:${/value="persona" selected/.test(r)} · grpOculto:${/id="af-facturara-grp"[^>]*display:none/.test(r)} · ACME:${/ACME/.test(r)}]`));
t(run('D facturarAField empresa (prefill, grp visible)', true, `facturarAField({tipo:'empresa',empresaId:'eA',razonSocial:'ACME'},'af-e-facturara')`,
  r => `[empresaSel:${/value="empresa" selected/.test(r)} · optSel:${/value="eA" selected/.test(r)} · grpVisible:${/id="af-e-facturara-grp"[^>]*display:(?!none)/.test(r)||!/af-e-facturara-grp[^>]*display:none/.test(r)}]`));
t(run('E facturarAChip empresa vs persona', true, `facturarAChip({tipo:'empresa',razonSocial:'ACME'})+'|'+'['+facturarAChip(null)+']'`,
  r => `[chip:${/Factura a: ACME/.test(r)} · vacío:${/\|\[\]/.test(r)}]`));
t(run('F empFormEdit CONTABLE (editor de convenio, monto prefilled)', true, `empFormEdit('eA')`,
  r => `[editor:${/Guardar convenio/.test(r)} · modoFijoSel:${/value="fijo"[^>]*selected/.test(r)} · monto80000:${/value="80000"/.test(r)} · montoVisible:${!/emp-conv-monto-grp"[^>]*display:none/.test(r)}]`));
t(run('G empFormEdit AFILIADOS-puro (chip read-only, sin editor)', false, `empFormEdit('eA')`,
  r => `[sinEditor:${!/Guardar convenio/.test(r)} · chip:${/Convenio: fijo \$80\.000/.test(r)} · loEditaContable:${/lo edita el contable/.test(r)}]`));
t(run('H empFormEdit CONTABLE empresa SIN convenio (modo — sin cargar —)', true, `empFormEdit('eB')`,
  r => `[editor:${/Guardar convenio/.test(r)} · sinCargarSel:${/value=""[^>]*selected/.test(r)} · montoOculto:${/emp-conv-monto-grp"[^>]*display:none/.test(r)}]`));

// ---- Bug 1: semántica de write sobre el mapa 'convenio' (fijo→per_capita→fijo) ----
// empGuardarConvenio construye el mapa completo cada vez ({modo:'fijo',montoMensual} | {modo:'per_capita'}).
// set(merge:true) FUSIONA mapas anidados (deja montoMensual residual); update() REEMPLAZA. Modelamos ambas.
const applyMerge   = (prev, next) => ({ ...prev, ...next });   // set({convenio},{merge:true})  ← el bug
const applyReplace = (prev, next) => ({ ...next });            // update({convenio})            ← el fix
const convenioOkCli = c => !c || !c.modo ? true
  : !['fijo','per_capita'].includes(c.modo) ? false
  : c.modo==='fijo' ? (typeof c.montoMensual==='number' && c.montoMensual>0 && Object.keys(c).length===2)
  : (!('montoMensual' in c) && Object.keys(c).length===1);
const seq = [ {modo:'fijo',montoMensual:80000}, {modo:'per_capita'}, {modo:'fijo',montoMensual:50000} ];
function corre(apply){ let cur={}; const estados=[]; for(const n of seq){ cur=apply(cur,n); estados.push({...cur}); } return estados; }
const conReplace = corre(applyReplace);
const conMerge   = corre(applyMerge);
t((() => {
  const replaceTodosOk = conReplace.every(convenioOkCli);
  const percapReplaceLimpio = !('montoMensual' in conReplace[1]);
  const mergePercapRoto = !convenioOkCli(conMerge[1]) && conMerge[1].montoMensual===80000; // demuestra el bug viejo
  const okCaso = replaceTodosOk && percapReplaceLimpio && mergePercapRoto;
  console.log(`${okCaso?'✓':'✗'} I fijo→per_capita→fijo · update(replace):todos convenioOk=${replaceTodosOk} per_capita_limpio=${percapReplaceLimpio} · set(merge):per_capita_roto(residual 80000)=${mergePercapRoto}`);
  return okCaso;
})());

console.log(`\n${ok}/${ok+fail} checks E-2 en verde (render + semántica de write)`);
process.exit(fail?1:0);
