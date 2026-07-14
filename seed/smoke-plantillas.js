// Smoke — Fase2: plantillas de permisos (CAP_PRESETS) + render de spCardPermisos.
const fs=require('fs'), vm=require('vm'), path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8').split('\n');
const sl=(a,b)=>lines.slice(a-1,b).join('\n');
const CAPS=sl(862,875), PRESETS=sl(6825,6830), spCard=sl(6838,6858);

const src=`
  function esc(s){ return String(s); }
  ${CAPS}
  ${PRESETS}
  ${spCard}
  globalThis.__CAPS__=CAPS; globalThis.__PRESETS__=CAP_PRESETS;
  globalThis.__render__=(u)=>spCardPermisos(u);
`;
const sandbox={ console, S:{ user:{ uid:'super' } } };
vm.runInNewContext(src, sandbox, {timeout:3000});
const CAPKEYS=sandbox.__CAPS__.map(([k])=>k);
const PRESETS_O=sandbox.__PRESETS__;
let ok=0, fail=0; const t=(l,c,x)=>{ (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l}${x?' → '+x:''}`); };

// 1) CAPS = 12, sin huérfanas
t('CAPS tiene 12 caps', CAPKEYS.length===12, CAPKEYS.length+'');
t('CAPS ya NO tiene ver_dashboard/ver_auditoria', !CAPKEYS.includes('ver_dashboard') && !CAPKEYS.includes('ver_auditoria'));
t('CAPS incluye las 4 nuevas', ['facturar','clinico','marketing','curar_novedades'].every(k=>CAPKEYS.includes(k)));

// 2) cada cap de cada preset existe en CAPS
for(const [id,p] of Object.entries(PRESETS_O)){
  t(`preset '${id}' solo usa caps válidas`, p.caps.every(c=>CAPKEYS.includes(c)), p.caps.join(','));
}
// 3) presets esperados
t('preset contable = facturar+gestionar_cobranza', JSON.stringify(PRESETS_O.contable.caps.sort())===JSON.stringify(['facturar','gestionar_cobranza'].sort()));
t('preset medico = clinico', JSON.stringify(PRESETS_O.medico.caps)===JSON.stringify(['clinico']));
t('preset marketing = marketing+curar_novedades', JSON.stringify(PRESETS_O.marketing.caps.sort())===JSON.stringify(['curar_novedades','marketing']));
t('preset admin = las 8 de la migración', PRESETS_O.admin.caps.length===8 && !PRESETS_O.admin.caps.some(c=>['gestionar_moviles','gestionar_guardias','gestionar_agenda_turnos','despachar_episodios'].includes(c)));

// 4) render: self (superadmin) NO configura; otro usuario -> 12 checkboxes + 4 botones de preset + confirm div
const rSelf=sandbox.__render__({uid:'super'});
t('render self → mensaje "siempre tiene todos"', /siempre tiene todos/.test(rSelf));
const rOtro=sandbox.__render__({uid:'u2', email:'x@y.z', permisos:{ facturar:true }});
t('render otro → 12 checkboxes sp-cap', (rOtro.match(/class="sp-cap"/g)||[]).length===12, ((rOtro.match(/class="sp-cap"/g)||[]).length)+'');
t('render otro → 4 botones de plantilla', (rOtro.match(/spAplicarPreset\(/g)||[]).length===4);
t('render otro → tiene sp-confirm y botón Guardar', /id="sp-confirm"/.test(rOtro) && /spGuardarPermisos\('u2'\)/.test(rOtro));
t('render otro → facturar viene tildado (checked)', /data-cap="facturar" checked/.test(rOtro));

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
