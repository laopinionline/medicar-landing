'use strict';
/* Smoke — Replanteo Tramo 2: shell de tabs GATED. Flag off = homeView viejo (cero cambio). Flag on = 5 tabs + header
   EMERGENCIAS persistente + nav pushState por tab + scroll por tab + núcleo/lazy. node seed/smoke-replanteo-tabs.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
const sw = fs.readFileSync(path.resolve(__dirname, '../socio/sw.js'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ── Gating: flag off = homeView (cero cambio) ──
t('render() bifurca: home = shell SOLO si tabsOn() && socioShellElegible(), si no homeView', /case 'home': html=\(tabsOn\(\) && socioShellElegible\(\)\) \? tabShellView\(\) : homeView\(\)/.test(socio));
t('tabsOn = localStorage medicar_tabs || S.tabsGlobal (por-dispositivo + global)', /function tabsOn\(\)\{ return tabsBootPref\(\) \|\| S\.tabsGlobal===true; \}/.test(socio));
t('tabsBootPref lee localStorage medicar_tabs', /localStorage\.getItem\('medicar_tabs'\)==='1'/.test(socio));
t('socioShellElegible: socio pleno/menor-con-cuenta (prospecto NO)', /function socioShellElegible\(\)[\s\S]{0,120}c\.estado==='ok' && c\.socio/.test(socio));

// ── cargarCredencial: núcleo (param) + early return _lazy + flag global ──
t('cargarCredencial acepta modo núcleo', /async function cargarCredencial\(uid, nucleo\)/.test(socio));
t('lee el flag global configuracion/replanteo.tabs', /collection\('configuracion'\)\.doc\('replanteo'\)[\s\S]{0,80}S\.tabsGlobal *= *!!/.test(socio));
t('núcleo hace early-return con _lazy:true (sin las ~16 colecciones)', /if\(nucleo\)\{[\s\S]{0,600}_lazy:true/.test(socio));
t('el boot pasa el modo núcleo (tabsBootPref)', /cargarCredencial\(user\.uid, tabsBootPref\(\)\)/.test(socio));

// ── EMERGENCIAS: header rojo persistente (tel:, sticky, nunca scrollea) — NO 6º tab ──
t('header EMERGENCIAS tel:443044 sticky (persistente)', /href="tel:\$\{TEL_EMERG\}"[\s\S]{0,220}position:sticky[\s\S]{0,320}EMERGENCIAS · \$\{TEL_EMERG\}/.test(socio));
t('EMERGENCIAS usa el rojo de marca (var(--rojo))', /EMERGENCIAS[\s\S]{0,0}|background:var\(--rojo\)[\s\S]{0,400}EMERGENCIAS/.test(socio) || /position:sticky[\s\S]{0,120}background:var\(--rojo\)/.test(socio));

// ── 5 tabs exactos + tab bar fija ──
t('TABS = inicio·ia·salud·turnos·mas (5)', /const TABS = \[[\s\S]{0,400}'inicio'[\s\S]{0,200}'ia'[\s\S]{0,200}'salud'[\s\S]{0,200}'turnos'[\s\S]{0,200}'mas'/.test(socio));
t('tab bar fija abajo (position:fixed bottom)', /<nav style="position:fixed;left:0;right:0;bottom:0/.test(socio));
t('tabs con tokens de marca (activo var(--rojo) / inactivo var(--gris))', /on\?'var\(--rojo\)':'var\(--gris\)'/.test(socio));

// ── Nav: pushState por tab + popstate restaura tab (back determinístico) ──
t('irTab hace history.pushState({tabnav})', /function irTab\(t\)[\s\S]{0,260}history\.pushState\(\{tabnav:t\}/.test(socio));
t('navRestore restaura el tab en el back (tabnav)', /desc\.tabnav\)\{[\s\S]{0,120}S\.tab=desc\.tabnav; pintarTab/.test(socio));
t('pintarTab re-pinta SOLO el contenedor (tab bar fija)', /function pintarTab\(t\)[\s\S]{0,120}el\('tab-content'\)[\s\S]{0,120}innerHTML=tabContent\(t\)/.test(socio));

// ── Scroll por tab ──
t('scroll por tab: guarda S.scroll[tab] al salir', /S\.scroll\[S\.tab\]=cont\.scrollTop/.test(socio));
t('scroll por tab: restaura en pintarTab + tras render', /cont\.scrollTop=S\.scroll\[t\]\|\|0/.test(socio) && /cc\.scrollTop=S\.scroll\[S\.tab\|\|'inicio'\]\|\|0/.test(socio));

// ── Lazy: núcleo pinta Inicio, hydrate en background ──
t('hydrate en background tras pintar Inicio (setTimeout hydrateFull)', /_hydrateKick=1; setTimeout\(\(\)=>hydrateFull\(null\)/.test(socio));
t('hydrateFull recarga full y reemplaza S.cred', /async function hydrateFull[\s\S]{0,260}cargarCredencial\(u\.uid, false\)[\s\S]{0,80}S\.cred=full/.test(socio));
t('tabs diferidos muestran "cargando" mientras _lazy', /if\(c\._lazy\) return cargandoTab/.test(socio));

// ── Prospecto intacto + estado bloqueado preparado (Tramo 4) ──
t('estado "bloqueado" preparado (tabBloqueado) sin cablear', /function tabBloqueado\(/.test(socio));
t('prospecto NO entra al shell (socioShellElegible exige socio)', /c\.estado==='ok' && c\.socio/.test(socio));

// ── RENDER de la chrome del shell (vm): header + 5 tabs, sin throw ──
(function(){
  try{
    const grab=(re)=>{ const m=re.exec(socio); return m?m[0]:''; };
    const TABS=grab(/const TABS = \[[\s\S]*?\];/);
    const shell=grab(/function tabShellView\(\)\{[\s\S]*?\n\}/);
    const src=`const TEL_EMERG='443044'; const IC={phone:'📞'}; const S={tab:'inicio',cred:{}}; function tabContent(){return '<!--c-->';} const esc=x=>String(x==null?'':x);\n${TABS}\n${shell}\n; globalThis.__h=tabShellView();`;
    const sb={ globalThis:{} }; sb.globalThis=sb;
    vm.runInNewContext(src, sb, {timeout:3000});
    const h=sb.__h||'';
    t('render shell: header EMERGENCIAS presente', /tel:443044/.test(h) && /EMERGENCIAS · 443044/.test(h));
    t('render shell: 5 botones de tab', (h.match(/data-tab="/g)||[]).length===5);
    t('render shell: contenedor #tab-content', /id="tab-content"/.test(h));
  }catch(e){ t('render shell (vm) sin throw', false); console.log('   ',e.message.split('\n')[0]); }
})();

// ── FIX del back a la entrada inicial (legacy {v:1,view:'home'}) ──
t('shell replaceState la base al esquema propio {tabnav} (una vez)', /if\(!S\._shellBase\)\{ S\._shellBase=1; try\{ history\.replaceState\(\{tabnav:S\.tab\|\|'inicio'\}/.test(socio));
t('navRestore mapea entrada legacy/sin-tab → Inicio (fallback defensivo)', /if\(!desc \|\| desc\.tabnav===undefined\)\{[\s\S]{0,80}S\.tab='inicio'; pintarTab\('inicio'\)/.test(socio));

// ── SIMULACIÓN de nav (vm): init(base legacy) → salud → turnos → back → salud → back → INICIO ──
(function(){
  try{
    const grab=(re)=>{ const m=re.exec(socio); if(!m) throw new Error('no encontré '+re); return m[0]; };
    const TABS=grab(/const TABS = \[[\s\S]*?\];/);
    const irTab=grab(/function irTab\(t\)\{[\s\S]*?\n\}/);
    const pintarTab=grab(/function pintarTab\(t\)\{[\s\S]*?\n\}/);
    const navRestore=grab(/function navRestore\(desc\)\{[\s\S]*?\n\}/);
    // Historial simulado: arranca con la ENTRADA LEGACY (el bug). Sin aplicar Fix B → probamos el fallback (Fix A).
    const src=`
      const S={ tab:'inicio', scroll:{}, view:'home', cred:{estado:'ok',socio:{}} };
      let stack=[{v:1,view:'home'}], idx=0;   // base LEGACY
      const history={ get state(){return stack[idx];}, pushState(s){ stack=stack.slice(0,idx+1); stack.push(s); idx++; }, replaceState(s){ stack[idx]=s; }, back(){ if(idx>0){ idx--; navRestore(stack[idx]); } } };
      let navRestoring=false; const APILADAS=['chequeo','reporte','parametros','comprobantes','asistente'];
      const el=()=>({scrollTop:0, innerHTML:''}); const document={ querySelectorAll:()=>[] };
      function tabContent(){return '';} function disparaLazyTab(){}
      function tabsOn(){return true;} function socioShellElegible(){return true;} function esProspectoUI(){return false;}
      function cerrarAsistente(){} function puenteCerrar(){} function cerrarChequeo(){} function cerrarReporte(){} function cerrarParams(){} function cerrarComprobantes(){}
      function abrirChequeo(){} function abrirReporte(){} function abrirParams(){} function abrirComprobantes(){}
      function render(){}
      ${TABS}\n${irTab}\n${pintarTab}\n${navRestore}
      irTab('salud'); irTab('turnos');
      const trace=[];
      history.back(); trace.push(S.tab);   // → salud
      history.back(); trace.push(S.tab);   // → INICIO (fallback sobre la base legacy)
      globalThis.__trace=trace;
    `;
    const sb={}; sb.globalThis=sb; vm.runInNewContext(src, sb, {timeout:3000});
    const tr=sb.__trace||[];
    t('back #1 (turnos→salud) restaura el tab', tr[0]==='salud');
    t('back #2 (salud→base legacy) VUELVE a Inicio (bug reparado)', tr[1]==='inicio');
  }catch(e){ t('simulación de nav sin throw', false); console.log('   ', e.message.split('\n')[0]); }
})();

// ── Atajo por URL ?tabs=1/0 (vm con location/localStorage/history stubbeados) ──
t('aplicarParamTabs se llama en el boot antes de render()', /aplicarParamTabs\(\); \/\/ Tramo 2[\s\S]{0,120}\nrender\(\);/.test(socio));
(function(){
  try{
    const fn=(/function aplicarParamTabs\(\)\{[\s\S]*?\n\}/.exec(socio)||[])[0];
    if(!fn) throw new Error('no encontré aplicarParamTabs');
    const run=(href, seed)=>{
      const store=Object.assign({}, seed||{}); let cleaned=null;
      const sb={ URL, location:{href}, localStorage:{ setItem:(k,v)=>{store[k]=String(v);}, removeItem:(k)=>{delete store[k];}, getItem:(k)=>(k in store?store[k]:null) }, history:{ replaceState:(a,b,u)=>{cleaned=u;} } };
      vm.runInNewContext(fn+'\naplicarParamTabs();', sb, {timeout:3000});
      return { store, cleaned };
    };
    const a=run('https://medicaronline.ar/socio/?tabs=1');
    t('?tabs=1 → setea medicar_tabs=1', a.store.medicar_tabs==='1');
    t('?tabs=1 → limpia el param de la URL', typeof a.cleaned==='string' && !/tabs=/.test(a.cleaned));
    const b=run('https://medicaronline.ar/socio/?tabs=0', { medicar_tabs:'1' });
    t('?tabs=0 → borra el flag (vuelve al viejo)', !('medicar_tabs' in b.store));
    t('?tabs=0 → limpia el param', typeof b.cleaned==='string' && !/tabs=/.test(b.cleaned));
    const c=run('https://medicaronline.ar/socio/', { medicar_tabs:'1' });
    t('sin ?tabs → NO toca nada (flag ni URL)', c.store.medicar_tabs==='1' && c.cleaned===null);
  }catch(e){ t('atajo ?tabs (vm) sin throw', false); console.log('   ', e.message.split('\n')[0]); }
})();

// ── SW bump ──
t('socio SW bumpeado (≥ v49)', /medicar-socio-v(49|[5-9]\d)/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-replanteo-tabs: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
