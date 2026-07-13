// Smoke de RENDER (PWA-1): ejecuta paramsFormView() con fixture y verifica los 4 signos + su botón "i".
const fs=require('fs'); const vm=require('vm'); const path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','socio','index.html'),'utf8').split('\n');
const sl=(a,b)=>lines.slice(a-1,b).join('\n');

const esc=sl(571,571); const TEL=sl(565,565); const PARAMS=sl(1419,1424); const paramsFormView=sl(1471,1503);
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
