'use strict';
// Smoke — Tab de leads/prospectos en el panel /app/ (sub-sección de Marketing) + CF gestionarProspecto.
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
const fn = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// --- Orden del listado (helper puro extraído del panel) ---
const line = (src, re) => { const m = re.exec(src); if (!m) throw new Error('no encontré ' + re); return m[0]; };
const P = new Function(line(app, /const PROSP_ORDEN=.*/) + '\n' + line(app, /function prospOrden\(e\)\{.*\}/) + '\nreturn {o:prospOrden};')();
t('orden: afiliacion_en_proceso PRIMERO (0)', P.o('afiliacion_en_proceso') === 0);
t('orden: solicito_afiliacion después (1)', P.o('solicito_afiliacion') === 1);
t('orden: nuevo al final (2)', P.o('nuevo') === 2);
t('orden: estado desconocido → 3 (último)', P.o('cualquiera') === 3);
t('orden ES en-proceso < asesor < nuevo', P.o('afiliacion_en_proceso') < P.o('solicito_afiliacion') && P.o('solicito_afiliacion') < P.o('nuevo'));

// --- CLIENTE: sub-sección Prospectos en el tab Marketing ---
t('sub-tab "Prospectos" agregado al head de Marketing', /tab\('prospectos','Prospectos'\+mktProspBadge\(\)\)/.test(app));
t('dispatch: sub==="prospectos" → mktProspectosView', /sub==='prospectos' \? mktProspectosView\(\)/.test(app));
t('listener onSnapshot sobre la colección prospectos', /db\.collection\('prospectos'\)\.onSnapshot/.test(app));
t('ordena por prospOrden y luego timestamp', /sort\(\(a,b\)=>\(prospOrden\(a\.estado\)-prospOrden\(b\.estado\)\)\|\|\(prospTs\(b\)-prospTs\(a\)\)\)/.test(app));
t('lead completo en-proceso: plan + total en la fila', /planElegido&&p\.planElegido\.nombre.*prospMoney\(p\.planElegido&&p\.planElegido\.total\)/.test(app));
t('ficha: teléfono clickeable (tel:) + email (mailto:)', /href="tel:\$\{esc\(p\.telefono\)\}"/.test(app) && /href="mailto:\$\{esc\(p\.email\)\}"/.test(app));
t('ficha: integrantes con nombre/DNI/nac/vínculo + domicilio', /Integrante \$\{i\+2\} · \$\{esc\(m\.vinculo/.test(app) && /comparte domicilio del titular/.test(app));
t('ficha: domicilio del titular con calleId', /dom\.calleId\?` <span[^`]*\[\$\{esc\(dom\.calleId\)\}\]/.test(app));
t('descartados detrás de un toggle (no bloquean la vista activa)', /Ver descartados \(\$\{nDesc\}\)/.test(app) && /filter\(p=>showDesc\|\|!desc\(p\)\)/.test(app));

// --- ACCIONES por CF (contactado/descartar/reactivar) + gate marketing ---
t('acciones llaman gestionarProspecto', /fnsCall\('gestionarProspecto',\{prospectoId:id,accion\}\)/.test(app) && /accion:'descartar',motivo/.test(app));
t('acciones gateadas por puede("marketing")', /function mktProspAccion\(id,accion\)\{ if\(!puede\('marketing'\)\)/.test(app));
t('descartar exige motivo en el cliente', /Ingresá el motivo del descarte/.test(app));
t('Activar reusa convPrefill/convOpenAlta (sin marcar convertido)', /function mktActivarProspecto[\s\S]{0,260}S\.convLeadId=null; S\.convPrefill=\{ nombre:p\.nombre/.test(app));

// --- SERVER: CF gestionarProspecto ---
t('CF gestionarProspecto existe', /exports\.gestionarProspecto = onCall/.test(fn));
t('CF gate: superadmin || permisos.marketing', /roles\.includes\('superadmin'\) \|\| \(u\.permisos && u\.permisos\.marketing === true\)/.test(fn));
t('CF acciones: contactado / descontactar / descartar / reactivar', /accion === 'contactado'/.test(fn) && /accion === 'descontactar'/.test(fn) && /accion === 'descartar'/.test(fn) && /accion === 'reactivar'/.test(fn));
t('CF descartar exige motivo', /Falta el motivo del descarte/.test(fn));
t('CF escribe en gestion (prospectos sigue write:false → CF-only)', /gestion: \{ contactado: true/.test(fn) && /gestion: \{ descartado: true/.test(fn));
t('CF valida que el prospecto exista', /Prospecto inexistente/.test(fn));

// --- Regresión: la sub-sección NO rompe el resto del tab Marketing ---
t('regresión: Leads/Campañas/Métricas siguen en el head', /tab\('leads','Leads'\)/.test(app) && /tab\('campanas','Campañas'\)/.test(app) && /tab\('metricas','Métricas'\)/.test(app));
t('regresión: mktDetach limpia el listener (incluye prospectos)', /function mktDetach\(\)\{ if\(S\.mktUnsub\)/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-panel-prospectos: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
