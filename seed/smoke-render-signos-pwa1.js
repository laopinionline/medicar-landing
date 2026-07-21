// Smoke de RENDER (PWA-1): ejecuta paramsFormView() con fixture y verifica los 4 signos + su botón "i".
const vm=require('vm');
const { lines, sym, konst, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L=lines('socio/index.html');

const esc=sym(L,'esc'); const TEL=konst(L,'TEL_EMERG'); const PARAMS=konst(L,'PARAMS')+'\n'+konst(L,'SIGNOS_INFO'); const paramsFormView=fn(L,'paramsFormView');
const stubs=`const S=__S__; function chv(){return '';} const IC={phone:''};`;
const src=`${esc}\n${TEL}\n${PARAMS}\n${stubs}\n${paramsFormView}\n`;

function run(label, par, checks){
  try{
    const sandbox={ console, __S__:{ par } };
    const r=vm.runInNewContext(`(function(){\n${src}\n return paramsFormView();\n})()`, sandbox, {timeout:3000});
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    console.log(`✓ ${label} → string(${r.length}) ${checks?checks(r):''}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok=0, fail=0; const t=b=>b?ok++:fail++;

t(run('formulario de signos con los 4 "i"', { vals:{}, err:'', busy:false, done:null }, r=>{
  const signos=['Frecuencia cardíaca','Presión sistólica','Temperatura','Saturación'].every(s=>r.includes(s));
  const botones=(r.match(/class="sig-i"/g)||[]).length;
  const handlers=['fc','sis','temp','spo2'].every(k=>r.includes(`signoInfoAbrir('${k}')`));
  const aria=(r.match(/aria-label="Información sobre/g)||[]).length;
  const inputs=(r.match(/id="par-/g)||[]).length;
  return `[4signos:${signos} · botonesI:${botones} · handlers4:${handlers} · aria:${aria} · inputs:${inputs}]`;
}));
t(run('con valores tipeados (no se pierden en el render)', { vals:{fc:'72', sis:'120'}, err:'', busy:false, done:null }, r=>{
  return `[fc72:${/value="72"/.test(r)} · sis120:${/value="120"/.test(r)}]`;
}));

console.log(`\n${ok}/${ok+fail} render de paramsFormView sin throw`);
process.exit(fail?1:0);
