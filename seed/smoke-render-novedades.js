// Smoke de RENDER (PWA-2a): ejecuta el ABM de Novedades (novPanel + vistas) con fixtures.
const fs=require('fs'); const vm=require('vm'); const path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8').split('\n');
const sl=(a,b)=>lines.slice(a-1,b).join('\n');
const esc=sl(1612,1612); const nov=sl(4729,4849);
const stubs=`const S=__S__; function render(){} function navPush(){} function audit(){} const FV=()=>1; const db=null;`;
const src=`${esc}\n${stubs}\n${nov}\n`;

const POSTS_PEND=[
  { id:'p1', origen:'laopinion', cat:'salud', titulo:'Alerta por triquinosis', bajada:'Casos en la región.', link:'https://laopinionline.ar/articulo/x', fuenteNombre:'La Opinión', fechaFuente:{seconds:4102444800}, estado:'pendiente' },
  { id:'p2', origen:'externo', cat:'nutri', titulo:'Grasas en la dieta', bajada:'Guía de MedlinePlus.', link:'https://medlineplus.gov/x', fuenteNombre:'MedlinePlus', fechaFuente:{seconds:4102444700}, estado:'pendiente' },
];
const POSTS_PUB=[{ id:'q1', origen:'interno', cat:'medicar', titulo:'Sumamos un móvil', bajada:'Más cobertura.', link:null, fuenteNombre:'MEDICAR', fechaFuente:{seconds:4102444800}, estado:'publicado' }];

function run(label, novState, user, checks){
  try{
    const sandbox={ console, __S__:{ nov:novState, user:user||{rol:'admin',uid:'u1'}, novPendCount:(novState&&novState.pendientes||[]).length } };
    const r=vm.runInNewContext(`(function(){\n${src}\n return novPanel();\n})()`, sandbox, {timeout:3000});
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    console.log(`✓ ${label} → string(${r.length}) ${checks?checks(r):''}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok=0, fail=0; const t=b=>b?ok++:fail++;

t(run('A pendientes (2) con Aprobar/Editar/Descartar + badge', { sub:'pendientes', pendientes:POSTS_PEND, publicados:[], edit:null }, null,
  r=>`[cards2:${(r.match(/novAprobar\(/g)||[]).length===2} · editar:${/novEditarAbrir/.test(r)} · descartar:${/novDescartar/.test(r)} · verFuente:${/Ver fuente/.test(r)} · badge:${/Pendientes \(2\)/.test(r)} · chipCuidado:${/Cuidado/.test(r)}]`));
t(run('B publicados con Despublicar', { sub:'publicados', pendientes:[], publicados:POSTS_PUB, edit:null }, null,
  r=>`[despublicar:${/novDespublicar\('q1'\)/.test(r)} · movil:${/Sumamos un móvil/.test(r)} · sinLink:${!/Ver fuente/.test(r)}]`));
t(run('C nueva (alta interno)', { sub:'nueva', pendientes:[], publicados:[], edit:null }, null,
  r=>`[form:${/novCrearInterno/.test(r)} · titulo:${/nov-n-titulo/.test(r)} · mensaje:${/nov-n-bajada/.test(r)}]`));
t(run('D editar (prefill titulo/bajada)', { sub:'pendientes', pendientes:POSTS_PEND, publicados:[], edit:'p1' }, null,
  r=>`[editView:${/Editar antes de publicar/.test(r)} · tituloPrefill:${/value="Alerta por triquinosis"/.test(r)} · guardar:${/novEditarGuardar\('p1'\)/.test(r)}]`));
t(run('E pendientes vacío', { sub:'pendientes', pendientes:[], publicados:[], edit:null }, null,
  r=>`[empty:${/No hay novedades pendientes/.test(r)}]`));
t(run('F gate: no-admin no entra', { sub:'pendientes', pendientes:[], publicados:[], edit:null }, {rol:'despachante',uid:'u2'},
  r=>`[soloAdmin:${/Solo para administradores/.test(r)}]`));

console.log(`\n${ok}/${ok+fail} vistas del ABM de Novedades sin throw`);
process.exit(fail?1:0);
