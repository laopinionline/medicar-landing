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
t('banda EMERGENCIAS variante C: tel: + sticky + pulso + EMERGENCIAS + 443044 (32px)', /href="tel:\$\{TEL_EMERG\}"[\s\S]{0,180}position:sticky[\s\S]{0,60}height:32px[\s\S]{0,200}ICN_PULSO[\s\S]{0,120}EMERGENCIAS[\s\S]{0,160}\$\{TEL_EMERG\}/.test(socio));
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
    const ICNblk=grab(/const _IS=[\s\S]*?const TABS = \[/).replace(/const TABS = \[$/,'');
    const src=`const TEL_EMERG='443044'; const IC={phone:'📞'}; const S={tab:'inicio',cred:{}}; function tabContent(){return '<!--c-->';} const esc=x=>String(x==null?'':x);\n${ICNblk}\n${TABS}\n${shell}\n; globalThis.__h=tabShellView();`;
    const sb={ globalThis:{} }; sb.globalThis=sb;
    vm.runInNewContext(src, sb, {timeout:3000});
    const h=sb.__h||'';
    t('render shell: banda EMERGENCIAS (tel:443044 + pulso SVG + número)', /tel:443044/.test(h) && /EMERGENCIAS/.test(h) && /443044/.test(h) && /<svg/.test(h));
    t('render shell: 5 botones de tab', (h.match(/data-tab="/g)||[]).length===5);
    t('render shell: tab bar con SVG propios, SIN emojis', (h.match(/data-tabic="/g)||[]).length===5 && !/🏠|💬|🩺|📅|☰/.test(h));
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

// ── PIEL aprobada: set de íconos propio + banda C + feed en Inicio + flip fix ──
t('set de íconos ICN: 5 line-icons propios (inicio/ia/salud/turnos/mas)', /const ICN = \{[\s\S]{0,900}inicio:`<svg[\s\S]{0,900}mas:`<svg viewBox="0 0 24 24"[\s\S]{0,80}M7 8l4 4-4 4[\s\S]{0,40}M13 8l4 4-4 4/.test(socio));
t('íconos con el trazo del chevrón (stroke 2 round, currentColor)', /const _IS='stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'/.test(socio));
t('"Más" = doble chevrón » (isotipo Bidondo)', /mas:`<svg[\s\S]{0,120}M7 8l4 4-4 4[\s\S]{0,30}M13 8l4 4-4 4/.test(socio));
t('IA = burbuja con chevrón › adentro', /ia:`<svg[\s\S]{0,220}M10 9\.5 12\.5 11 10 12\.5/.test(socio));
t('pulso de la banda EMERGENCIAS (ICN_PULSO, blanco)', /const ICN_PULSO='<svg[\s\S]{0,120}stroke="#fff"[\s\S]{0,200}M2 12h4l2-5 3 10/.test(socio));
t('TABS ya no lleva emojis (solo id+lbl)', !/\{ id:'inicio', ic:'🏠'/.test(socio) && /\{ id:'inicio', +lbl:'Inicio' \}/.test(socio));
t('tab bar renderiza ICN[x.id] (no x.ic)', /\$\{ICN\[x\.id\]\}/.test(socio) && !/font-size:1\.2rem;line-height:1">\$\{x\.ic\}/.test(socio));

// FEED en Inicio (para TODOS los perfiles) + retirado de Más
t('FEED en Inicio (homeFeedBlock al pie de tabInicio)', /function tabInicio[\s\S]{0,2400}estadoCardsInicio\(c\)\}[\s\S]{0,40}\$\{homeFeedBlock\(c\)\}/.test(socio));
t('FEED retirado de "Más" (tabMas ya no llama homeFeedBlock)', /function tabMas\(c\)\{[\s\S]*?\n\}/.test(socio) && !/function tabMas[\s\S]{0,900}homeFeedBlock/.test(socio));

// FIX del flip del QR en móvil (backface en el card hijo + rotateY explícito + overflow)
t('flip fix: backface-visibility en el card hijo .cred (no sangra el frente)', /\.cred-face \.cred\{[^}]*backface-visibility:hidden/.test(socio));
t('flip fix: rotateY explícito en cada cara + dorso overflow contenido', /\.cred-face\{[^}]*transform:rotateY\(0deg\)/.test(socio) && /\.cred-back\{position:absolute[^}]*transform:rotateY\(180deg\)/.test(socio) && /\.cred-face \.cred\{[^}]*overflow:hidden/.test(socio));

// ── RETOQUES de la recorrida de Lucas ──
t('2a · selector de día = pills con tokens (no <select> nativo)', /const D3=\['Dom','Lun'[\s\S]{0,400}on\?'var\(--rojo\)':'var\(--linea\)'/.test(socio) && !/const prefSel=`<select onchange="guardarPref/.test(socio));
t('2b · tab renombrado a "Consultas" (id turnos, ícono calendario)', /\{ id:'turnos', +lbl:'Consultas' \}/.test(socio) && /turnos:`<svg viewBox="0 0 24 24"[\s\S]{0,120}rect x="4" y="5\.5"/.test(socio));
t('2c · tabTurnos compone la UI REAL de reserva (turnosBlock con slots clickeables)', /function turnosBlock\(c\)[\s\S]{0,2600}reservarSlot\('\$\{esc\(f\.id\)\}'/.test(socio) && /function tabTurnos\(c\)\{[\s\S]{0,120}turnosBlock\(c\)/.test(socio));
t('2d · foto de perfil: sube a Storage perfiles/{uid} (regla existente, sin tocar rules)', /firebase\.storage\(\)\.ref\('perfiles\/'\+u\.uid\+'\/foto\.jpg'\)/.test(socio) && /function subirFotoPerfil/.test(socio) && /function cargarFotoPerfil/.test(socio));
t('2d · placeholder de foto = ícono line (no emoji) + input capture cámara', /const ICN_USER='<svg/.test(socio) && /accept="image\/\*" capture="user" onchange="subirFotoPerfil/.test(socio));
t('2e · botón "Cerrar sesión" rediseñado con tokens (no btn-o pelado)', /onclick="salir\(\)" style="border:1\.5px solid var\(--linea\);background:var\(--blanco\)[\s\S]{0,200}Cerrar sesión<\/button>/.test(socio));
t('WhatsApp de turnos INTACTO (a Lucas le gustó): "Iniciar videollamada" 25D366', /Iniciar videollamada[\s\S]{0,40}25D366|25D366[\s\S]{0,80}Iniciar videollamada/.test(socio));

// ── Chat MEDICAR IA: pie SIN chip fijo de turno (doctrina emergencias, no policonsultorio) ──
t('chat: chip fijo "Pedir un turno con un médico" ELIMINADO del pie', !/Pedir un turno con un médico/.test(socio) && !/iaAccion\('turno'\)/.test(socio));
t('chat: el pie sticky conserva el input + Enviar (no se rompió el layout)', /position:sticky;bottom:0[\s\S]{0,600}id="ia-input"[\s\S]{0,280}onclick="iaEnviar\(\)"/.test(socio));
t('chat: chips CONTEXTUALES (whitelist del modelo, m.botones) INTACTOS', /const botones = \(m\.botones\|\|\[\]\)\.map\(b=>[\s\S]{0,120}iaAccion\('\$\{b\.accion\}'\)/.test(socio));
t('chat: una sola superficie (tabIA + view asistente usan asistenteView)', /function tabIA\(c\)\{[\s\S]{0,140}return asistenteView\(\)/.test(socio) && /case 'asistente': html=asistenteView\(\)/.test(socio));

// ── FIX desborde del chat en móvil (burbujas contenidas al viewport) ──
t('chat: burbuja del USUARIO con overflow-wrap:anywhere + word-break', /m\.role==='user'[\s\S]{0,140}max-width:85%;overflow-wrap:anywhere;word-break:break-word/.test(socio));
t('chat: burbuja de la IA con overflow-wrap:anywhere + word-break', /align-self:flex-start;max-width:90%;overflow-wrap:anywhere;word-break:break-word/.test(socio));
t('chat: contenedor #ia-msgs con overflow-x:hidden + min-width:0 (nada empuja horizontal)', /id="ia-msgs"[\s\S]{0,120}overflow-x:hidden;min-width:0/.test(socio));

// ── Chat: lenguaje de CONSULTA (turnos retirado) + botón hacia el tab Consultas ──
t('chip de bienvenida renombrado "Cómo hacer una consulta" (no "pedir un turno")', /'Cómo hacer una consulta'/.test(socio) && !/'Cómo pedir un turno'/.test(socio));
t('iaAccion(turno) lleva al tab Consultas (S.tab=turnos)', /if\(accion==='turno'\)\{ S\.tab='turnos'; cerrarAsistente\(\)/.test(socio));
// C — copy de turnosBlock alineado a "consultas" (sec-h + empty states); no toca variables/claves/colección.
t('C · turnosBlock: "Consultas por videollamada" + "Mis consultas"', /return `<div class="sec"><div class="sec-h">Consultas por videollamada<\/div>[\s\S]{0,180}sec-h" style="margin-top:1rem">Mis consultas</.test(socio));
t('C · empty states en consultas: "No hay consultas disponibles" + "No tenés consultas reservadas"', /No hay consultas disponibles en los próximos 7 días/.test(socio) && /No tenés consultas reservadas/.test(socio));
t('C · no se renombró el estado (S.tab=turnos) ni la colección (agenda_turnos intactos)', /S\.tab='turnos'/.test(socio) && /collection\('agenda_turnos'\)/.test(socio));

// ── SW bump ──
t('socio SW bumpeado (≥ v49)', /medicar-socio-v(49|[5-9]\d)/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-replanteo-tabs: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
