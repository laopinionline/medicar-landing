// Smoke — pg() cap-driven: el router COMPARTIDO de cap-tabs rutea para CUALQUIER rol.
const vm=require('vm');
const { lines, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const pgSrc=fn(lines('app/index.html'), 'pg');

const PANELS=['miPerfil','movPanel','cronoPanel','agendaTurnosPanel','catPanel','afPanel','facPanel','cobPanel','novPanel','mktPanel','audPanel','estPanel','monPanel','bandeja','medAlertas','mHome','dDesp','choferHome','superView','adHome'];
const stubs=`
  function pedLimpiarVinculo(){}
  ${PANELS.map(p=>`function ${p}(){return '${p}';}`).join('\n  ')}
`;
function route(rol,tab){
  const sandbox={ console, S:{ user:{rol}, tab, pedidoReporteId:null, epView:null } };
  vm.runInNewContext(`${stubs}\n${pgSrc}\n globalThis.__r__=pg();`, sandbox, {timeout:3000});
  return sandbox.__r__;
}
let ok=0, fail=0;
const t=(label,rol,tab,exp)=>{ const r=route(rol,tab); const c=r===exp; (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${label}: pg(${rol},${tab}) → ${r}${c?'':' (esperaba '+exp+')'}`); };

// ★ cap-tabs ruteadas off-rol (la parte que faltaba)
t('★ contable rutea Móviles',       'contable','moviles','movPanel');
t('★ contable rutea Cobranza',      'contable','cobranza','cobPanel');
t('★ medico rutea Cobranza',        'medico','cobranza','cobPanel');
t('★ despachante rutea Afiliados',  'despachante','afiliados','afPanel');
t('★ contable rutea Monitoreo',     'contable','monitoreo','monPanel');
t('★ chofer rutea Marketing',       'chofer','marketing','mktPanel');
// estructurales del rol intactas
t('medico home → mHome',            'medico','home','mHome');
t('medico episodios → bandeja',     'medico','episodios','bandeja');
t('medico alertas → medAlertas',    'medico','alertas','medAlertas');
t('despachante default → bandeja',  'despachante','bandeja','bandeja');
t('despachante despacho → dDesp',   'despachante','despacho','dDesp');
t('contable default → facPanel',    'contable','facturacion','facPanel');
t('admin home → adHome',            'admin','home','adHome');
t('chofer default → choferHome',    'chofer','home','choferHome');
t('perfil (cualquiera) → miPerfil', 'contable','perfil','miPerfil');
t('superadmin → superView',         'superadmin','x','superView');

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
