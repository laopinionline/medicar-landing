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
t('el index bundleado existe y trae esAppNativa (scaffold nativo)', /esAppNativa/.test(bundled));

// 3) esAppNativa: false en web (sin window.Capacitor), true en nativo
const { lines: extractLines, fn }=require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código)
const src=fn(extractLines('socio/index.html'), 'esAppNativa')+'\n';
const run=(cap)=>{ const sb={ window: cap?{Capacitor:{isNativePlatform:()=>true}}:{} }; vm.runInNewContext(`var window=this.window;${src}\n this.r=esAppNativa();`, sb, {timeout:2000}); return sb.r; };
t('esAppNativa() = false en el NAVEGADOR (sin window.Capacitor)', run(false)===false);
t('esAppNativa() = true en la app NATIVA (Capacitor inyecta window.Capacitor)', run(true)===true);

// 4) DOCTRINA: socio/ es SOLO para afiliados. El staff-puro ve "Esta app es solo para socios" + Salir (web y nativo
//    por igual); NO se rutea al panel desde socio/. El concepto staff-nativo + el redirect a /app/ fueron eliminados.
t('rama staff → view no-afiliado (solo para socios), sin redirect a /app/', /if\(destino === 'staff'\)\{[\s\S]{0,320}set\(\{ view:'no-afiliado', cred \}\); return;/.test(socio));
t('redirect a ../app/ ELIMINADO de socio/', !/window\.location\.replace\('\.\.\/app\/'\)/.test(socio));
t('staff-nativo ELIMINADO (sin view ni case)', !/staffNativoView/.test(socio) && !/case 'staff-nativo'/.test(socio));
t('cartel "Esta app es solo para socios"', /Esta app es solo para socios/.test(socio));

// 5) la PWA web sigue intacta (no se rompió el flujo afiliado normal)
t('flujo afiliado intacto: sigue el home tras cred ok', /set\(\{ view:'home', cred[,)].*navReplace\(\)/.test(socio));
// version-agnóstico: el scaffold A1 bumpeó a v36; sigue vigente mientras el SW esté en v36 o superior (hoy va por v46+).
t('SW bumpeado ≥ v36 (baseline nativa A1)', (() => { const m = /medicar-socio-v(\d+)/.exec(fs.readFileSync(path.join(root, 'socio', 'sw.js'), 'utf8')); return !!m && parseInt(m[1], 10) >= 36; })());

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
