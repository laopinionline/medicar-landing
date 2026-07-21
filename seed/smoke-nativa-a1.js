// Smoke — App nativa Fase A1: scaffold Capacitor + guarda del redirect staff en nativo.
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.join(__dirname,'..');
const socio=fs.readFileSync(path.join(root,'socio','index.html'),'utf8');
let ok=0, fail=0; const t=(l,c,x)=>{ (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l}${x?' → '+x:''}`); };

// 1) capacitor.config apunta a socio/
const cfg=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
t('capacitor.config.webDir = "socio" (empaqueta la PWA tal cual)', cfg.webDir==='socio', cfg.webDir);
t('appId definido', /\./.test(cfg.appId||''), cfg.appId);
// 2) proyecto android generado + assets copiados con la guarda
t('android/ generado', fs.existsSync(path.join(root,'android','app','src','main','assets','public','index.html')));
const bundled=fs.readFileSync(path.join(root,'android','app','src','main','assets','public','index.html'),'utf8');
t('el index bundleado tiene la guarda staff-nativo', /staffNativoView/.test(bundled) && /esAppNativa/.test(bundled));

// 3) esAppNativa: false en web (sin window.Capacitor), true en nativo
const { lines: extractLines, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const src=fn(extractLines('socio/index.html'), 'esAppNativa')+'\n';
const run=(cap)=>{ const sb={ window: cap?{Capacitor:{isNativePlatform:()=>true}}:{} }; vm.runInNewContext(`var window=this.window;${src}\n this.r=esAppNativa();`, sb, {timeout:2000}); return sb.r; };
t('esAppNativa() = false en el NAVEGADOR (sin window.Capacitor)', run(false)===false);
t('esAppNativa() = true en la app NATIVA (Capacitor inyecta window.Capacitor)', run(true)===true);

// 4) la rama staff usa la guarda: nativo → staff-nativo, web → redirect a ../app/
t('rama staff: en nativo → view staff-nativo (no redirect)', /if\(esAppNativa\(\)\)\{ set\(\{ view:'staff-nativo'/.test(socio));
t('rama staff: en web → window.location.replace(../app/)', /window\.location\.replace\('\.\.\/app\/'\)/.test(socio));
t('render tiene case staff-nativo', /case 'staff-nativo': html=staffNativoView\(\)/.test(socio));
t('staffNativoView muestra la URL del panel web', /medicaronline\.ar\/app\//.test(socio));

// 5) la PWA web sigue intacta (no se rompió el flujo afiliado normal)
t('flujo afiliado intacto: sigue el home tras cred ok', /set\(\{ view:'home', cred \}\); navReplace\(\)/.test(socio));
t('SW bumpeado a v11', /medicar-socio-v11/.test(fs.readFileSync(path.join(root,'socio','sw.js'),'utf8')));

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
