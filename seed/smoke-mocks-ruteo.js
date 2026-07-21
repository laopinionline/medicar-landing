// Smoke — TRAMO LIMPIEZA A2/A3: mocks ruteados fuera del panel.
// Extrae getTabs/pg/entrarConRol reales de app/index.html y verifica que:
//  - getTabs('afiliado') NO trae Historia ni Turnos (solo Perfil).
//  - getTabs(admin/default) NO trae Guardias ni Atenciones (sí Afiliados/Inicio/Perfil).
//  - pg() afiliado NO rutea hist/turnos/aHome/plan (solo perfil; resto '').
//  - pg() admin NO rutea guardias/atenciones (solo home/perfil de esos ids).
//  - entrarConRol('afiliado') REDIRIGE a ../socio/ y NO fija S.user.rol.
const vm=require('vm');
const { lines, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L=lines('app/index.html');
const entrarConRol=fn(L,'entrarConRol'), getTabs=fn(L,'getTabs'), pg=fn(L,'pg');

// Vistas y helpers stubeados: cada vista devuelve su propio nombre para poder assertar el ruteo.
const VIEWS=['miPerfil','movPanel','cronoPanel','agendaTurnosPanel','mHome','bandeja','medAlertas',
  'catPanel','afPanel','facPanel','cobPanel','novPanel','mktPanel','audPanel','estPanel','monPanel',
  'adHome','superView','choferHome','aHome','hist','plan','turnos','adGuardias','adAtenc'];
const stubs=`
  const IC={home:'',history:'',plan:'',dispatch:'',user:'',chart:'',users:'',register:'',settings:''};
  ${VIEWS.map(v=>`function ${v}(){return '${v}';}`).join('\n  ')}
  function puede(c){return __CAPS__.includes(c);}
  function puedeConfig(){return __CAPS__.includes('configurar_sistema')||S.user.rol==='admin';}
  function puedeCobrar(){return __CAPS__.includes('gestionar_cobranza')||S.user.rol==='admin';}
  function puedeAfil(){return __CAPS__.includes('gestionar_afiliados')||S.user.rol==='admin';}
  function novBadgeAttach(){}
  function pedLimpiarVinculo(){}
  function set(o){Object.assign(S,o);}
  function navReplace(){}
  function loadStaffMedico(){}
`;
const src=`${stubs}\n${entrarConRol}\n${getTabs}\n${pg}\n`;

function ctx(rol, tab, caps){
  const redirects=[];
  const sandbox={
    console,
    __CAPS__: caps||[],
    S:{ user:{rol, roles:['afiliado','admin'], uid:'u1', nombre:'X'}, tab, novPendCount:0 },
    sessionStorage:{ removeItem(){}, setItem(){}, getItem(){return null;} },
    window:{ location:{ replace(u){ redirects.push(u); } } },
  };
  vm.runInNewContext(`${src}\n globalThis.__run__=()=>({getTabs,pg,entrarConRol});`, sandbox, {timeout:3000});
  return { sandbox, api: sandbox.__run__(), redirects };
}
let ok=0, fail=0;
const t=(label, cond, extra)=>{ (cond?ok++:fail++); console.log(`${cond?'✓':'✗'} ${label}${extra?' → '+extra:''}`); };

// getTabs('afiliado')
{ const {api}=ctx('afiliado','perfil'); const ids=api.getTabs('afiliado').map(x=>x.id);
  t("getTabs('afiliado') = solo Perfil, sin historia/turnos/home/plan",
    JSON.stringify(ids)==='["perfil"]', JSON.stringify(ids)); }

// getTabs(admin default)
{ const {api}=ctx('admin','home',['configurar_sistema','gestionar_afiliados','gestionar_cobranza','gestionar_moviles','gestionar_guardias','gestionar_agenda_turnos']);
  const ids=api.getTabs('admin').map(x=>x.id);
  t("getTabs(admin) SIN guardias ni atenciones", !ids.includes('guardias')&&!ids.includes('atenciones'), JSON.stringify(ids));
  t("getTabs(admin) conserva home/afiliados/perfil/cronograma", ['home','afiliados','perfil','cronograma'].every(x=>ids.includes(x))); }

// pg() afiliado: los mocks NO rutean
{ for(const tab of ['historia','turnos','home','plan']){ const {api,sandbox}=ctx('afiliado',tab); sandbox.S.tab=tab;
    t(`pg() afiliado/${tab} -> '' (mock sin ruta)`, api.pg()==='', JSON.stringify(api.pg())); }
  const {api,sandbox}=ctx('afiliado','perfil'); sandbox.S.tab='perfil';
  t("pg() afiliado/perfil -> miPerfil (real)", api.pg()==='miPerfil'); }

// pg() admin: guardias/atenciones NO rutean; home/otros sí
{ for(const tab of ['guardias','atenciones']){ const {api,sandbox}=ctx('admin',tab); sandbox.S.tab=tab;
    t(`pg() admin/${tab} -> '' (mock sin ruta)`, api.pg()==='', JSON.stringify(api.pg())); }
  for(const [tab,exp] of [['home','adHome'],['afiliados','afPanel'],['cobranza','cobPanel'],['monitoreo','monPanel']]){
    const {api,sandbox}=ctx('admin',tab); sandbox.S.tab=tab;
    t(`pg() admin/${tab} -> ${exp} (real)`, api.pg()===exp, JSON.stringify(api.pg())); } }

// entrarConRol('afiliado') redirige y NO fija rol
{ const {api,sandbox,redirects}=ctx('despachante','bandeja'); api.entrarConRol('afiliado');
  t("entrarConRol('afiliado') redirige a ../socio/", redirects.length===1&&redirects[0]==='../socio/', JSON.stringify(redirects));
  t("entrarConRol('afiliado') NO fija S.user.rol=afiliado", sandbox.S.user.rol!=='afiliado', 'rol='+sandbox.S.user.rol); }
// entrarConRol(staff) NO redirige y fija rol
{ const {api,sandbox,redirects}=ctx('despachante','bandeja'); api.entrarConRol('admin');
  t("entrarConRol('admin') NO redirige", redirects.length===0);
  t("entrarConRol('admin') fija S.user.rol=admin", sandbox.S.user.rol==='admin'); }

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
