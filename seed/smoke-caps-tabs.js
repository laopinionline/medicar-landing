// Smoke — TABLERO FASE 1: getTabs por perfil de caps (la visibilidad de tabs = las caps, sin bypass de rol).
const vm=require('vm');
const { lines, fns, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const L=lines('app/index.html');
const puedes=fns(L,['puede','puedeConfig','puedeCobrar','puedeAfil']), getTabs=fn(L,'getTabs');

const src=`
  const IC={home:'',history:'',plan:'',dispatch:'',user:'',chart:'',users:'',register:'',settings:''};
  function novBadgeAttach(){}
  ${puedes}
  ${getTabs}
`;

function tabsFor(rol, permisos){
  const sandbox={ console, S:{ user:{ rol, permisos: permisos||{} }, novPendCount:0 } };
  vm.runInNewContext(`${src}\n globalThis.__t__=getTabs(${JSON.stringify(rol)}).map(t=>t.id);`, sandbox, {timeout:3000});
  return sandbox.__t__;
}
let ok=0, fail=0;
const has=(arr,id)=>arr.includes(id);
const t=(label,cond,extra)=>{ (cond?ok++:fail++); console.log(`${cond?'✓':'✗'} ${label}${extra?'  → '+extra:''}`); };

const ADMIN_PRESET={ configurar_sistema:true, facturar:true, clinico:true, gestionar_afiliados:true, marketing:true, gestionar_cobranza:true, gestionar_personal:true, curar_novedades:true };
// mapa cap -> tab de gestión (viven en la rama 'admin' = return default de getTabs). facturacion la abre facturar O configurar.
const MAP=[ ['configurar_sistema','catalogo'], ['configurar_sistema','auditoria'], ['configurar_sistema','estadisticas'],
  ['facturar','facturacion'], ['gestionar_cobranza','cobranza'], ['clinico','monitoreo'],
  ['marketing','marketing'], ['curar_novedades','novedades'], ['gestionar_moviles','moviles'],
  ['gestionar_guardias','cronograma'], ['gestionar_agenda_turnos','agendaturnos'] ];

// superadmin navega por superView (getTabs devuelve solo home+perfil, por diseño)
{ const T=tabsFor('superadmin',{}); t('superadmin: getTabs = home+perfil (usa superView)', has(T,'home')&&has(T,'perfil')&&T.length===2, JSON.stringify(T)); }

// admin general (preset) ve TODAS las de gestión
{ const T=tabsFor('admin',ADMIN_PRESET);
  t('admin-general ve catalogo/facturacion/cobranza/monitoreo/marketing/novedades/auditoria/estadisticas',
    ['catalogo','facturacion','cobranza','monitoreo','marketing','novedades','auditoria','estadisticas'].every(x=>has(T,x)), JSON.stringify(T)); }

// admin recortado: SOLO gestionar_afiliados -> ve Afiliados, NADA de config/facturar/clinico/etc (el corazón del tramo en UI)
{ const T=tabsFor('admin',{ gestionar_afiliados:true });
  t('admin recortado (solo afiliados) → NO ve catalogo/facturacion/cobranza/monitoreo/marketing/novedades/auditoria/estadisticas',
    !['catalogo','facturacion','cobranza','monitoreo','marketing','novedades','auditoria','estadisticas'].some(x=>has(T,x)), JSON.stringify(T));
  t('admin recortado igual ve Afiliados (tab hardcodeada) y Perfil', has(T,'afiliados')&&has(T,'perfil')); }

// cada cap enciende SU tab (rol 'admin' = rama con todos los tabs de gestión)
for(const [cap,tab] of MAP){
  const T=tabsFor('admin',{ [cap]:true });
  t(`cap '${cap}' → enciende '${tab}'`, has(T,tab), JSON.stringify(T));
}
// facturar NO enciende catalogo/monitoreo/marketing/cobranza (split real)
{ const T=tabsFor('admin',{ facturar:true });
  t('facturar NO enciende catalogo/monitoreo/marketing/cobranza', !['catalogo','monitoreo','marketing','cobranza'].some(x=>has(T,x)), JSON.stringify(T)); }
// clinico NO enciende facturacion/catalogo/marketing
{ const T=tabsFor('admin',{ clinico:true });
  t('clinico NO enciende facturacion/catalogo/marketing', !['facturacion','catalogo','marketing'].some(x=>has(T,x)), JSON.stringify(T)); }
// marketing enciende SOLO marketing
{ const T=tabsFor('admin',{ marketing:true });
  t('marketing enciende SOLO marketing (no monitoreo/facturacion/catalogo)', has(T,'marketing') && !['monitoreo','facturacion','catalogo'].some(x=>has(T,x)), JSON.stringify(T)); }
// configurar_sistema (solo) NO enciende facturacion... salvo que factTab abre con facturar O configurar -> SÍ la ve (tarifas)
{ const T=tabsFor('admin',{ configurar_sistema:true });
  t('configurar_sistema ve catalogo/auditoria/estadisticas; facturacion también (tarifas)', ['catalogo','auditoria','estadisticas','facturacion'].every(x=>has(T,x)) && !['monitoreo','marketing','cobranza','novedades'].some(x=>has(T,x)), JSON.stringify(T)); }
// admin pelado (sin caps): solo afiliados+perfil+home
{ const T=tabsFor('admin',{});
  t('admin SIN caps → sin tabs de gestión (solo home/afiliados/perfil)', !MAP.some(([,tab])=>has(T,tab)), JSON.stringify(T)); }

// Fase2 — rol contable
{ const T=tabsFor('contable',{ facturar:true, gestionar_cobranza:true });
  t('contable ve SOLO Facturación + Cobranza + Perfil', JSON.stringify(T)==='["facturacion","cobranza","perfil"]', JSON.stringify(T)); }
{ const T=tabsFor('contable',{ facturar:true, gestionar_cobranza:true });
  t('contable NO ve catalogo/monitoreo/marketing/novedades/afiliados', !['catalogo','monitoreo','marketing','novedades','afiliados','moviles','cronograma'].some(x=>has(T,x)), JSON.stringify(T)); }
{ const T=tabsFor('contable',{});
  t('contable SIN caps → solo Perfil', JSON.stringify(T)==='["perfil"]', JSON.stringify(T)); }

// ★ CAP-DRIVEN off-rol: la cap enciende su tab en CUALQUIER rol
{ const T=tabsFor('contable',{ facturar:true, gestionar_cobranza:true, gestionar_moviles:true });
  t('★ contable + gestionar_moviles VE Móviles', has(T,'moviles'), JSON.stringify(T)); }
{ const T=tabsFor('medico',{ gestionar_cobranza:true });
  t('★ medico + gestionar_cobranza VE Cobranza', has(T,'cobranza'), JSON.stringify(T)); }
{ const T=tabsFor('despachante',{ gestionar_afiliados:true });
  t('★ despachante + gestionar_afiliados VE Afiliados (antes hardcodeada a admin)', has(T,'afiliados'), JSON.stringify(T)); }
{ const T=tabsFor('contable',{ clinico:true });
  t('★ contable + clinico VE Monitoreo', has(T,'monitoreo'), JSON.stringify(T)); }
{ const T=tabsFor('chofer',{ marketing:true });
  t('★ chofer + marketing VE Marketing', has(T,'marketing'), JSON.stringify(T)); }
// afiliados YA NO es hardcodeada: admin sin la cap NO la ve
{ const T=tabsFor('admin',{ configurar_sistema:true });
  t('★ admin SIN gestionar_afiliados NO ve Afiliados (ya no hardcodeada)', !has(T,'afiliados'), JSON.stringify(T)); }
// estructurales del rol se conservan
{ const T=tabsFor('despachante',{});
  t('despachante conserva bandeja+despacho estructurales', has(T,'bandeja')&&has(T,'despacho'), JSON.stringify(T)); }
{ const T=tabsFor('medico',{});
  t('medico conserva home+episodios+alertas estructurales', ['home','episodios','alertas'].every(x=>has(T,x)), JSON.stringify(T)); }

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
