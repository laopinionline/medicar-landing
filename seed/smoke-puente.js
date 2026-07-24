'use strict';
// Smoke — PUENTE DE COMPRA (checkout del prospecto). Extrae los helpers PUROS de una línea del cliente y los testea,
// + verifica el wiring estructural (checkout, gate de regresión, estados del CTA). node seed/smoke-puente.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
// Extrae una función de UNA línea por nombre (las del puente lo son) y la evalúa.
const grab = (name) => { const m = new RegExp('^\\s*function ' + name + '\\s*\\([^)]*\\)\\s*\\{.*\\}\\s*$', 'm').exec(html); if (!m) throw new Error('no encontré ' + name); return (0, eval)('(' + m[0].trim().replace(/^function /, 'function ') + ')'); };

const totalPlan = grab('totalPlan');
const edadDe = grab('edadDe');
const planDeTexto = grab('planDeTexto');

// --- Familiar: 2 base + N adicionales, recalculado ---
t('Familiar 2 personas = $40.000 (solo base)', totalPlan('familiar', 2).total === 40000);
t('Familiar 3 = $50.000 (2 base + 1 adic)', totalPlan('familiar', 3).total === 50000);
t('Familiar 4 = $60.000 (2 base + 2 adic)', totalPlan('familiar', 4).total === 60000);
t('Familiar clamp mínimo 2 (integrantes<2 no baja de $40.000)', totalPlan('familiar', 1).total === 40000 && totalPlan('familiar', 1).n === 2);
t('Joven = $20.000 fijo (1 persona)', totalPlan('joven', 5).total === 20000 && totalPlan('joven', 5).n === 1);
t('Senior = $60.000 fijo', totalPlan('senior', 3).total === 60000);

// --- Elegibilidad Joven ≤40 (edad desde fecha de nacimiento) ---
const hoy = new Date(); const y = hoy.getFullYear();
t('edadDe: ~30 años → 30', edadDe((y - 30) + '-01-01') === 30);
t('edadDe: >40 detecta la inelegibilidad', edadDe((y - 45) + '-06-15') > 40);
t('edadDe: fecha vacía/ inválida → null (no bloquea de más)', edadDe('') === null && edadDe('xx') === null);

// --- Empalme chat: detección del plan recomendado ---
t('planDeTexto: "te conviene el Plan Familiar" → familiar', planDeTexto('Para tu caso te conviene el Plan Familiar.') === 'familiar');
t('planDeTexto: "Plan Joven a $20.000" → joven', planDeTexto('Eso lo tenés con el Plan Joven a $20.000.') === 'joven');
t('planDeTexto: "Plan Senior" → senior', planDeTexto('El Plan Senior es para adultos mayores.') === 'senior');
t('planDeTexto: sin plan nombrado → null (abre en el selector)', planDeTexto('¿En qué te puedo ayudar?') === null);

// --- Wiring estructural ---
t('CF checkoutAfiliacion se invoca desde el pago', /fnsCall\('checkoutAfiliacion'/.test(html));
t('pago rotulado SIMULACIÓN — sin cobro real', /SIMULACIÓN — no se realiza ningún cobro real/.test(html));
t('GATE regresión: abrirPuente exige esProspectoUI', /function abrirPuente[\s\S]{0,120}if\(!esProspectoUI\(\)\) return;/.test(html));
t('GATE regresión: puenteView cae a prospectoView si no es prospecto', /function puenteView[\s\S]{0,120}if\(!esProspectoUI\(\)\)\{ return prospectoView/.test(html));
t('CTA home: estado en proceso → "Afiliación en proceso ✓"', /Afiliación en proceso ✓/.test(html) && /function afiliacionCTA/.test(html));
t('CTA home: asesor → "Un asesor te contacta ✓"', /Un asesor te contacta ✓/.test(html));
t('gate: el puente SOLO se bloquea con afiliacion_en_proceso (asesor NO bloquea)', /if\(est==='afiliacion_en_proceso'\)\{ set\(\{ view:'prospecto' \}\); return; \}/.test(html) && !/est==='afiliacion_en_proceso'\|\|est==='solicito_afiliacion'/.test(html));
t('home asesor: ADEMÁS ofrece "O afiliate ahora online"', /Un asesor te contacta ✓[\s\S]{0,400}O afiliate ahora online/.test(html));
t('Área Protegida / Corporativo NO están en el catálogo del selector', !/PLANES_COMERCIALES[\s\S]{0,400}(area protegida|corporativo)/i.test(html));
t('desglose visible "2 base + N adicionales"', /2 base \+ \$\{Math\.max\(0,P\.integrantes-2\)\} adicionales|2 base \+ .* adicionales/.test(html));
t('post-pago: confirmación "¡Bienvenido a MEDICAR!"', /¡Bienvenido a MEDICAR!/.test(html) && /Estamos activando tu cobertura/.test(html));
t('asesor: camino secundario "Prefiero que me contacte un asesor"', /Prefiero que me contacte un asesor/.test(html));
t('checkout pide fecha de nacimiento + domicilio (sin localidad libre)', /pt-fn/.test(html) && /pt-dom/.test(html) && !/pt-loc/.test(html));

// --- DOMICILIO con CALLEJERO (Pergamino) ---
t('carga el módulo callejero.js compartido', /<script src="\.\.\/callejero\.js"><\/script>/.test(html));
t('abrirPuente precarga el callejero (lazy)', /if\(window\.Callejero\) Callejero\.cargar\(\);/.test(html));
t('domicilio con datalist del callejero (calles-pgm)', /list="calles-pgm"/.test(html) && /<datalist id="calles-pgm">/.test(html));
t('valida el domicilio con Callejero.resolver (calleId + altura>0)', /Callejero\.resolver/.test(html) && /r\.calleId && r\.altura>0/.test(html));
t('domicilio fuera del callejero → aviso "no está en el callejero de Pergamino"', /no está en el callejero de Pergamino/.test(html));
t('persiste domicilio {texto,calleId,altura} al pagar', /domicilio:\{ texto:P\.datos\.domicilio, calleId:rt\.calleId, altura:rt\.altura \}/.test(html));

// --- INTEGRANTES del grupo (Familiar) ---
t('Familiar: fichas de integrantes (N-1) vía ajustarGrupo', /function ajustarGrupo[\s\S]{0,200}planKey==='familiar'\)\?Math\.max\(0,P\.integrantes-1\)/.test(html));
t('stepper ajusta fichas sin borrar (ajustarGrupo preserva y recorta)', /while\(P\.grupo\.length<n\) P\.grupo\.push/.test(html) && /P\.grupo=P\.grupo\.slice\(0,n\)/.test(html));
t('checkbox "Comparte los datos del titular" default marcado', /comparte:true/.test(html) && /Comparte los datos del titular/.test(html));
t('desmarcado → pide su propio domicilio con el callejero', /Domicilio de este integrante[\s\S]{0,80}list="calles-pgm"/.test(html));
t('integrante pide nombre+DNI+fecha nac+vínculo (VINCULOS)', /const VINCULOS=\['Cónyuge'/.test(html) && /puenteIntegDato\(\$\{i\},'vinculo'/.test(html));
t('SIN teléfono por integrante (el del titular cubre al grupo)', !/puenteIntegDato\(\$\{i\},'telefono'/.test(html));
t('validación: DNI de integrante único y ≠ titular', /ese DNI ya está cargado \(no puede repetirse\)/.test(html) && /titDni=String\(\(S\.prospecto&&S\.prospecto\.dni\)/.test(html));
t('Joven/Senior: sin sección de integrantes (solo familiar)', /P\.planKey==='familiar'\?`<div style="font-weight:800;margin:1rem 0 \.5rem">Integrantes del grupo/.test(html));
t('paga con grupo[] (comparteDomicilio o domicilio propio)', /grupo=\(P\.grupo\|\|\[\]\)\.map/.test(html) && /comparteDomicilio:!!m\.comparte/.test(html));

console.log(`\n${fail ? '✗' : '✓'} smoke-puente: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
