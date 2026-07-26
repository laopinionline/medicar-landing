'use strict';
// Smoke — VITALICIO (categoría propia: cobertura TOTAL sin cuota; de cara al socio NO se nombra). Facturación lo saltea
// (abonos+facturas), cargoDeEpisodio lo cubre (cubierto_vitalicio), IA dice "cobertura completa, sin cuota" sin nombrar
// plan/precio/categoría, credencial oculta plan+cuota (a1/a2), abrirCambiarPlan no-op (a3), panel neutraliza "Como
// afiliado" (a-bis) + chip VITALICIO al staff (d), cambiarMiPlan rechaza, checkbox solo admin. node seed/smoke-vitalicio.js
const fs = require('fs'), path = require('path');
const { agruparFacturas } = require('../functions/facturas-nucleo');
const { cargoDeEpisodio } = require('../functions/cargos-nucleo');
const { buildContexto } = require('../functions/asistente-prompt');
const fn = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
const socio = fs.readFileSync(path.resolve(__dirname, '../socio/index.html'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// --- 1) FACTURACIÓN: el motor (agruparFacturas) saltea el socio vitalicio — ni factura $0 ---
const socMap = { s1: { personaId: 'p1', activo: true }, s2: { personaId: 'p2', activo: true, vitalicio: true } };
const abonos = [
  { id: 'a1', socioId: 's1', personaId: 'p1', estado: 'generado', precioFinal: 18000, planNombre: 'Plan 01', periodo: '2099-01', socioNombre: 'Normal, N' },
  { id: 'a2', socioId: 's2', personaId: 'p2', estado: 'generado', precioFinal: 18000, planNombre: 'Plan 01', periodo: '2099-01', socioNombre: 'Vitalicio, V' },
];
const cargos = [{ id: 'c1', socioId: 's2', personaId: 'p2', estado: 'generado', precioFinal: 5000, tarifaNombre: 'X', nroIncidente: 1 }]; // cargo de un vitalicio: tampoco factura
const r = agruparFacturas({ abonos, cargos, socMap, empMap: {}, empresasYaFacturadas: [], periodo: '2099-01' });
t('factura para el socio NORMAL (p1)', r.grupos.some((g) => g.personaId === 'p1'));
t('NINGUNA factura para el socio VITALICIO (p2) — ni por abono ni por cargo', !r.grupos.some((g) => g.personaId === 'p2'));
t('vitalicio no aparece en corpExcl (se saltea antes, no es exclusión corporativa)', !r.corpExcl.includes('s2'));

// --- 2) IA (c): buildContexto vitalicio → "cobertura completa, sin cuota"; NUNCA nombra el plan, el precio ni la categoría ---
const ctxVit = buildContexto({ nombre: 'Lucas', plan: { nombre: 'Plan 01', precio: 18000, vitalicio: true }, cubre: ['emergencias'], factura: null, ultimaFactura: null, tel: '443044' });
t('vitalicio: cobertura COMPLETA/integral + SIN CUOTA', /cobertura/i.test(ctxVit) && /SIN CUOTA/.test(ctxVit) && /integral/i.test(ctxVit));
t('vitalicio: NO emite la línea "Tu plan asignado" (no nombra el plan del socio)', !/Tu plan asignado/.test(ctxVit));
t('vitalicio: NO lista coberturas parciales ("emergencias" del cubre) ni "Cubre:"', !/emergencias/.test(ctxVit) && !/Cubre:/.test(ctxVit));
t('vitalicio: NUNCA "$0" ni el precio ($18000)', !/\$0\b/.test(ctxVit) && !/\$?18000/.test(ctxVit));
t('vitalicio: instruye no nombrar plan/precio/categoría', /NUNCA le nombres un plan/.test(ctxVit));
// un socio NORMAL (no vitalicio) sigue con su cuota real
const ctxNorm = buildContexto({ nombre: 'Ana', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: [], factura: null, ultimaFactura: null, tel: '443044' });
t('regresión: socio normal sigue mostrando su cuota ($18000/mes)', /\$18000\/mes/.test(ctxNorm) && !/SIN CUOTA/.test(ctxNorm) && /Plan 01/.test(ctxNorm));

// --- 2b) COBERTURA (b1/b2): cargoDeEpisodio saltea al vitalicio (cobertura total, sin cargo) ---
const tar = [{ id: 't-emer', prestacionId: 'emergencias', nombre: 'Emergencia', tipoCalculo: 'fija', precioBase: 12000, activo: true }];
const epBase = (atrib) => ({ nroIncidente: 1, pacienteId: 'p1', pac: { nombre: 'X' }, codigoPresuntivo: 'rojo', atribucion: atrib });
t('b2: vitalicio (planSnapshot.vitalicio) → skip cubierto_vitalicio, aunque no tenga la cobertura', JSON.stringify(cargoDeEpisodio(epBase({ socioId: 's2', planSnapshot: { vitalicio: true, enCarencia: [] } }), 'ev', tar, 2026)) === JSON.stringify({ skip: 'cubierto_vitalicio' }));
t('b2 regresión: socio normal sin la cobertura → cargo fuera_cobertura (NO cubierto)', (cargoDeEpisodio(epBase({ socioId: 's1', planSnapshot: { coberturas: {}, enCarencia: [] } }), 'en', tar, 2026).cargo || {}).regla === 'fuera_cobertura');

// --- 2c) SOCIO PWA (a1/a2/a3): la credencial NO nombra plan/cuota si vitalicio; "Afiliado activo" queda ---
t('a: esVit derivado del flag en la credencial (vitalicio o bonificado → sin cuota, credencial pelada)', /const esVit = !!\(socio && \(socio\.vitalicio===true \|\| socio\.bonificado===true\)\)/.test(socio));
t('a1: celda "Plan" oculta si vitalicio (credCardHTML, ${d.esVit?...})', /\$\{d\.esVit\?''\:`<div class="cell"><span>Plan<\/span>/.test(socio));
t('a2: bloque de cuota NO se renderiza si vitalicio', /if\(socio && socio\.planId && c\.plan && !esVit\)\{/.test(socio));
t('a3: abrirCambiarPlan no-op defensivo si sin-cuota (vitalicio o bonificado)', /vitalicio===true \|\| S\.cred\.socio\.bonificado===true\)\) return;/.test(socio) && /function abrirCambiarPlan/.test(socio));
t('a: "Afiliado activo" sigue siendo la etiqueta neutra', /● Afiliado activo/.test(socio));

// --- 2d) PANEL (a-bis + d): vista "Como afiliado" neutralizada + chip VITALICIO en la lista ---
t('a-bis: "Como afiliado" neutraliza vitalicio ("Cobertura integral" + "Sin cuota", sin nombrar plan)', /s\.vitalicio===true\)\{[\s\S]{0,400}Cobertura integral[\s\S]{0,120}Sin cuota/.test(app));
t('d: chip VITALICIO para el staff en la lista de Afiliados', /function vitalicioChip/.test(app) && /vitalicioChip\(s\)/.test(app) && />VITALICIO</.test(app));

// --- 3) SERVER: cambiarMiPlan rechaza al vitalicio ("tu plan lo gestiona MEDICAR") ---
t('cambiarMiPlan: rechaza socio sin cuota (vitalicio o bonificado)', /socio\.vitalicio === true \|\| socio\.bonificado === true\) throw new HttpsError\('failed-precondition', 'Tu plan lo gestiona MEDICAR\.'\)/.test(fn));
// checkoutAfiliacion sigue rechazando cualquier key desconocida (no hay plan-vitalicio en el checkout)
t('checkout sin plan-vitalicio (rechaza key desconocida)', /Plan inválido/.test(fn) && !/plan-vitalicio/.test(fn));

// --- 4) CLIENTE (panel): generarAbonos saltea vitalicio + checkbox operable solo admin ---
t('generarAbonos: saltea socio vitalicio (rep.vitalicios)', /if\(socio\.vitalicio===true\)\{ rep\.vitalicios\+\+; continue; \}/.test(app));
t('checkbox Vitalicio en alta y edición (af-vitalicio / af-e-vitalicio)', /vitalicioField\(!!draft\.vitalicio,'af-vitalicio'\)/.test(app) && /vitalicioField\(!!s\.vitalicio,'af-e-vitalicio'\)/.test(app));
t('checkbox operable SOLO admin/superadmin (disabled si no)', /function vitalicioField/.test(app) && /admin\?'':'disabled'/.test(app) && /function esAdminOSuper/.test(app));
t('el flag vitalicio se persiste en el alta (4 literales) y en el edit', (app.match(/vitalicio:vitalicioSel/g) || []).length === 4 && /vitalicio:!!document\.getElementById\('af-e-vitalicio'\)/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-vitalicio: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
