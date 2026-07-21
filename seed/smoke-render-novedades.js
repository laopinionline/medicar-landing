// Smoke de RENDER (PWA-2a): ejecuta el ABM de Novedades (novPanel + vistas) con fixtures.
const vm=require('vm');
const { lines, fn, konst, range }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L=lines('app/index.html');
const esc=fn(L,'esc'); const nov=range(L,'novEsAdmin','novEditarCerrar'); // región completa del ABM (incluye NOV_CAT y helpers)
const stubs=`const S=__S__; function render(){} function navPush(){} function audit(){} const FV=()=>1; const db=null;
  function puede(){return true;} function curandoNovedades(){return true;} function novRerenderPend(){} function audita(){}
  const localStorage={getItem:()=>null,setItem:()=>{}};
  const document={getElementById:()=>null,createElement:()=>({}),querySelector:()=>null};`;
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
// PWA-2c — foto en el ABM: tarjeta con imagen + editar muestra "Imagen actual".
const POST_FOTO=[{ id:'pf', origen:'interno', cat:'medicar', titulo:'Móvil nuevo', bajada:'La foto es la noticia.', link:null, fuenteNombre:'MEDICAR', fechaFuente:{seconds:4102444800}, estado:'pendiente', imagenUrl:'https://firebasestorage.googleapis.com/v0/b/x/o/feed%2Fpf%2Fimg.jpg?alt=media' }];
t(run('G tarjeta ABM con foto (imagenUrl)', { sub:'pendientes', pendientes:POST_FOTO, publicados:[], edit:null }, null,
  r=>`[img:${/<img src="https:\/\/firebasestorage/.test(r)} · titulo:${/Móvil nuevo/.test(r)}]`));
t(run('H editar post con foto → "Imagen actual" + Reemplazar/Quitar', { sub:'pendientes', pendientes:POST_FOTO, publicados:[], descartados:[], edit:'pf', img:null, imgQuitar:false }, null,
  r=>`[imagenActual:${/Imagen actual/.test(r)} · reemplazar:${/Reemplazar/.test(r)} · quitar:${/feedImgQuitar/.test(r)}]`));
// FIX de la cola: publicados con Editar/Despublicar/Descartar · descartados con Restaurar · editar un publicado.
const POST_PUB=[{ id:'pub1', origen:'interno', cat:'medicar', titulo:'Novedad publicada', bajada:'x', link:null, fuenteNombre:'MEDICAR', fechaFuente:{seconds:4102444800}, estado:'publicado' }];
const POST_DESC=[{ id:'d1', origen:'externo', cat:'salud', titulo:'Algo descartado', bajada:'x', link:'https://x', fuenteNombre:'OPS', fechaFuente:{seconds:4102444800}, estado:'descartado' }];
t(run('I publicados: Editar + Despublicar + Descartar', { sub:'publicados', pendientes:[], publicados:POST_PUB, descartados:[], edit:null }, null,
  r=>`[editar:${/novEditarAbrir\('pub1'\)/.test(r)} · despublicar:${/novDespublicar\('pub1'\)/.test(r)} · descartar:${/novDescartar\('pub1'\)/.test(r)}]`));
t(run('J editar un PUBLICADO → título "Editar novedad publicada"', { sub:'publicados', pendientes:[], publicados:POST_PUB, descartados:[], edit:'pub1' }, null,
  r=>`[tituloPub:${/Editar novedad publicada/.test(r)} · guardar:${/novEditarGuardar\('pub1'\)/.test(r)}]`));
t(run('K sub-tab Descartados con Restaurar', { sub:'descartados', pendientes:[], publicados:[], descartados:POST_DESC, edit:null }, null,
  r=>`[restaurar:${/novRestaurar\('d1'\)/.test(r)} · post:${/Algo descartado/.test(r)} · nota30d:${/30 días/.test(r)}]`));
t(run('L descartados vacío', { sub:'descartados', pendientes:[], publicados:[], descartados:[], edit:null }, null,
  r=>`[empty:${/No hay novedades descartadas/.test(r)}]`));

console.log(`\n${ok}/${ok+fail} vistas del ABM de Novedades sin throw`);
process.exit(fail?1:0);
