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
// Orden vigente (evolucionó: se insertó pendiente_pago entre en-proceso y asesor):
// afiliacion_en_proceso(0) · pendiente_pago(1) · solicito_afiliacion(2) · nuevo(3) · desconocido(3).
t('orden: afiliacion_en_proceso PRIMERO (0)', P.o('afiliacion_en_proceso') === 0);
t('orden: pendiente_pago segundo (1)', P.o('pendiente_pago') === 1);
t('orden: solicito_afiliacion (asesor) tercero (2)', P.o('solicito_afiliacion') === 2);
t('orden: nuevo al final (3)', P.o('nuevo') === 3);
t('orden: estado desconocido → 3 (último, junto a nuevo)', P.o('cualquiera') === 3);
t('orden ES en-proceso < pendiente_pago < asesor < nuevo', P.o('afiliacion_en_proceso') < P.o('pendiente_pago') && P.o('pendiente_pago') < P.o('solicito_afiliacion') && P.o('solicito_afiliacion') < P.o('nuevo'));

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
// (el bloque AVISO-OVERRIDE de DNI se insertó antes del prefill → span ampliado; sigue sin marcar 'convertido')
t('Activar reusa convPrefill/convOpenAlta (sin marcar convertido)', /function mktActivarProspecto[\s\S]{0,760}S\.convLeadId=null; S\.convPrefill=\{ nombre:p\.nombre/.test(app) && /function mktActivarProspecto[\s\S]{0,900}S\.convOpenAlta=true/.test(app));

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

// ════════════════════ tramo/vinculacion-autodeclarados ════════════════════
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
const sw = fs.readFileSync(path.resolve(__dirname, '../socio/sw.js'), 'utf8');

// 1 · CF vincularProspectoASocio — reusa el CORE de canjearInvitacion (mismos guards) con cap gestionar_afiliados.
t('VINC · CF vincularProspectoASocio existe', /exports\.vincularProspectoASocio = onCall/.test(fn));
t('VINC · cap gestionar_afiliados || superadmin', /exports\.vincularProspectoASocio[\s\S]{0,500}roles\.includes\('superadmin'\)[\s\S]{0,80}gestionar_afiliados === true[\s\S]{0,8}throw new HttpsError\('permission-denied'/.test(fn));
t('VINC · guard: uid ya vinculado a otro socio → rechaza', /exports\.vincularProspectoASocio[\s\S]{0,1400}uData\.personaId !== personaId\) throw new HttpsError\('failed-precondition', 'Esa cuenta ya está vinculada a otro socio\.'\)/.test(fn));
t('VINC · guard: persona ya tiene login (personaTieneLogin) → rechaza', /exports\.vincularProspectoASocio[\s\S]{0,1500}personaTieneLogin\(personaId\) &&[\s\S]{0,80}throw new HttpsError\('failed-precondition', 'Esa persona ya tiene su cuenta\.'\)/.test(fn));
t('VINC · exige que el uid sea un PROSPECTO (no pisa socio/staff)', /exports\.vincularProspectoASocio[\s\S]{0,1000}prospectos'\)\.doc\(prospectoUid\)\.get\(\);[\s\S]{0,80}Ese prospecto no existe/.test(fn));
t('VINC · liga usuarios/{uid}.personaId + rol afiliado (idéntico a canje)', /usuarios'\)\.doc\(prospectoUid\)\.set\(\{ personaId, roles: rolesU, bienvenidaVinculacion: true \}/.test(fn) && /rol: 'afiliado', roles: \['afiliado'\], email, nombre, activo: true, bienvenidaVinculacion: true/.test(fn));
t('VINC · denorm cuentaPropia/cuentaUid en el socio (calco de canje 748)', /exports\.vincularProspectoASocio[\s\S]{0,3000}cuentaPropia: true, cuentaUid: prospectoUid/.test(fn));
t('VINC · higiene: marca prospectos/{uid} vinculado + vinculadoPersonaId', /vinculado: true, vinculadoEn: FV\(\), vinculadoPersonaId: personaId, docPedida: false/.test(fn));
t('VINC · cero-oráculo: la CF NO devuelve datos del padrón (solo {ok:true})', /\[vincularProspectoASocio\][\s\S]{0,80}return \{ ok: true \}/.test(fn));

// gestionarProspecto extendido: pedir_doc / quitar_doc (cap marketing intacta).
t('DOC · gestionarProspecto acción pedir_doc (docPedida + docNota)', /accion === 'pedir_doc'[\s\S]{0,220}docPedida: true, docPedidaEn: FV\(\), docPedidaPor: quien, docNota: nota \|\| null/.test(fn));
t('DOC · gestionarProspecto acción quitar_doc (reversible)', /accion === 'quitar_doc'[\s\S]{0,120}docPedida: false, docPedidaEn: null, docNota: null/.test(fn));

// 2 · Ficha: acciones solo con badge yaAfiliado + gateo por cap; confirmación fuerte; alta desplazada.
t('FICHA · vincBloque/docBloque solo en fichas yaAfiliado', /function vincBloque\(p\)\{\s*if\(p\.yaAfiliado!==true\) return '';/.test(app) && /function docBloque\(p\)\{\s*if\(p\.yaAfiliado!==true \|\| p\.vinculado===true \|\| !puede\('marketing'\)\) return '';/.test(app));
t('FICHA · "Vincular a su socio" gateado por gestionar_afiliados', /function vincBloque[\s\S]{0,400}!puede\('gestionar_afiliados'\)\) return `<div[\s\S]{0,140}habilidad <b>Afiliados<\/b>/.test(app));
t('FICHA · buscador por DNI (personas where dni) + socio por personaId', /function mktVincBuscar[\s\S]{0,400}collection\('personas'\)\.where\('dni','==',dni\)[\s\S]{0,260}collection\('socios'\)\.where\('personaId','==',personaId\)/.test(app));
t('FICHA · CONFIRMACIÓN FUERTE: nombre + DNI + N° socio + titular/dependiente', /Confirmá la vinculación[\s\S]{0,400}DNI <b>\$\{esc\(r\.dni\)\}<\/b> · N° socio <b>\$\{esc\(r\.numero\)\}<\/b> · \$\{r\.esTitular\?'Titular del grupo':'Dependiente'\}/.test(app));
t('FICHA · confirmación muestra los integrantes que porta si es titular', /Portará su grupo \(\$\{r\.integrantes\.length\}\)/.test(app) && /r\.integrantes\.map\(esc\)\.join/.test(app));
t('FICHA · confirmación deshabilita el botón si el socio YA tiene login', /Ese socio YA tiene una cuenta/.test(app) && /onclick="mktVincConfirmar\(\)" \$\{\(V\.busy\|\|r\.tieneLogin\)\?'disabled':''\}/.test(app));
t('FICHA · Confirmar → CF vincularProspectoASocio {prospectoUid, personaId}', /function mktVincConfirmar[\s\S]{0,220}fnsCall\('vincularProspectoASocio',\{ prospectoUid:V\.pid, personaId:V\.r\.personaId \}\)/.test(app));
t('FICHA · "Pedir documentación" → gestionarProspecto pedir_doc con nota', /function mktPedirDoc[\s\S]{0,220}fnsCall\('gestionarProspecto',\{prospectoId:id,accion:'pedir_doc',nota\}\)/.test(app));
t('FICHA · alta precargada DESPLAZADA en yaAfiliado (btn-o + advertencia, no eliminada)', /altaEsSecundaria=p\.yaAfiliado===true/.test(app) && /altaEsSecundaria\?'btn-o':'btn-r'/.test(app) && /usá <b>Vincular a su socio<\/b>/.test(app));

// 3 · Mensaje in-app (socio freemium) + bienvenida única.
t('MSG · docPedida en yaAfiliadoLink — mensaje sin datos del padrón', /function yaAfiliadoLink[\s\S]{0,220}S\.prospecto\.docPedida===true\) return[\s\S]{0,220}necesitamos documentación\. Comunicate con MEDICAR/.test(socio));
t('MSG · yaAfiliadoLink en las 2 puntas (cartel + credencial gris)', (socio.match(/\$\{yaAfiliadoLink\(\)\}/g) || []).length === 2);
t('MSG · bienvenida única: gate usuarios.bienvenidaVinculacion + flag local por uid', /function bienvenidaVincHTML\(c\)\{[\s\S]{0,180}u\.bienvenidaVinculacion!==true\) return ''[\s\S]{0,220}localStorage\.getItem\('medicar_bienv_'\+uid\)==='1'/.test(socio));
t('MSG · bienvenida se descarta con flag local (cerrarBienvenidaVinc)', /function cerrarBienvenidaVinc\(\)\{[\s\S]{0,140}localStorage\.setItem\('medicar_bienv_'\+uid,'1'\)/.test(socio));
t('MSG · bienvenida montada en el Inicio del socio (tabInicio)', /return `<div style="padding:1rem 1rem 0">\s*\$\{bienvenidaVincHTML\(c\)\}/.test(socio));
t('MSG · SW socio v62', /medicar-socio-v(6[2-9]|[7-9]\d)/.test(sw));

// ── mini-fix (a): botón alta-precargada en fichas yaAfiliado sin importar el estado (test CONDUCTUAL de la lógica real) ──
const mkActivar = new Function('p',
  line(app, /const altaEsSecundaria=p\.yaAfiliado===true;/) + '\n' +
  line(app, /const activar=\(p\.estado[^\n]*:'';/) + '\n return activar;');
t('FIX(a) · yaAfiliado + estado nuevo → botón VISIBLE, desplazado (btn-o) + advertencia', (() => { const a = mkActivar({ id: 'x', yaAfiliado: true, estado: 'nuevo' }); return a.includes("mktActivarProspecto('x')") && a.includes('btn-o') && a.includes('usá <b>Vincular a su socio</b>'); })());
t('FIX(a) · yaAfiliado + afiliacion_en_proceso → VISIBLE + advertencia, SIN duplicar botón', (() => { const a = mkActivar({ id: 'x', yaAfiliado: true, estado: 'afiliacion_en_proceso' }); return (a.match(/mktActivarProspecto/g) || []).length === 1 && a.includes('usá <b>Vincular a su socio</b>') && a.includes('btn-o'); })());
t('FIX(a) · NO-yaAfiliado + estado nuevo → botón AUSENTE (gate original intacto)', mkActivar({ id: 'x', yaAfiliado: false, estado: 'nuevo' }) === '');
t('FIX(a) · NO-yaAfiliado + afiliacion_en_proceso → VISIBLE (btn-r, SIN advertencia)', (() => { const a = mkActivar({ id: 'x', yaAfiliado: false, estado: 'afiliacion_en_proceso' }); return a.includes("mktActivarProspecto('x')") && a.includes('btn-r') && !a.includes('Vincular a su socio'); })());

console.log(`\n${fail ? '✗' : '✓'} smoke-panel-prospectos: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
