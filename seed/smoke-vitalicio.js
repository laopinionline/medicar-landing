'use strict';
// Smoke — VITALICIO (socio sin cuota, lo gestiona MEDICAR): facturación lo saltea, IA dice "sin cuota", cambiarMiPlan
// lo rechaza, generarAbonos lo saltea, checkbox operable solo admin (front). node seed/smoke-vitalicio.js
const fs = require('fs'), path = require('path');
const { agruparFacturas } = require('../functions/facturas-nucleo');
const { buildContexto } = require('../functions/asistente-prompt');
const fn = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
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

// --- 2) IA/CONTABLE: buildContexto vitalicio → "no tiene cuota", jamás "$0/mes" ---
const ctxVit = buildContexto({ nombre: 'Lucas', plan: { nombre: 'Plan 01', precio: 18000, vitalicio: true }, cubre: ['emergencias'], factura: null, ultimaFactura: null, tel: '443044' });
t('vitalicio: "TU PLAN NO TIENE CUOTA"', /TU PLAN NO TIENE CUOTA/.test(ctxVit));
t('vitalicio: NUNCA "$0" ni "$18000/mes" en la línea del plan', !/\$0\b/.test(ctxVit) && !/\$18000\/mes/.test(ctxVit));
t('vitalicio: instruye no expresarlo como monto', /NO la expreses como un monto ni como cero pesos/.test(ctxVit));
// un socio NORMAL (no vitalicio) sigue con su cuota real
const ctxNorm = buildContexto({ nombre: 'Ana', plan: { nombre: 'Plan 01', precio: 18000 }, cubre: [], factura: null, ultimaFactura: null, tel: '443044' });
t('regresión: socio normal sigue mostrando su cuota ($18000/mes)', /\$18000\/mes/.test(ctxNorm) && !/NO TIENE CUOTA/.test(ctxNorm));

// --- 3) SERVER: cambiarMiPlan rechaza al vitalicio ("tu plan lo gestiona MEDICAR") ---
t('cambiarMiPlan: rechaza socio vitalicio', /socio\.vitalicio === true\) throw new HttpsError\('failed-precondition', 'Tu plan lo gestiona MEDICAR\.'\)/.test(fn));
// checkoutAfiliacion sigue rechazando cualquier key desconocida (no hay plan-vitalicio en el checkout)
t('checkout sin plan-vitalicio (rechaza key desconocida)', /Plan inválido/.test(fn) && !/plan-vitalicio/.test(fn));

// --- 4) CLIENTE (panel): generarAbonos saltea vitalicio + checkbox operable solo admin ---
t('generarAbonos: saltea socio vitalicio (rep.vitalicios)', /if\(socio\.vitalicio===true\)\{ rep\.vitalicios\+\+; continue; \}/.test(app));
t('checkbox Vitalicio en alta y edición (af-vitalicio / af-e-vitalicio)', /vitalicioField\(!!draft\.vitalicio,'af-vitalicio'\)/.test(app) && /vitalicioField\(!!s\.vitalicio,'af-e-vitalicio'\)/.test(app));
t('checkbox operable SOLO admin/superadmin (disabled si no)', /function vitalicioField/.test(app) && /admin\?'':'disabled'/.test(app) && /function esAdminOSuper/.test(app));
t('el flag vitalicio se persiste en el alta (4 literales) y en el edit', (app.match(/vitalicio:vitalicioSel/g) || []).length === 4 && /vitalicio:!!document\.getElementById\('af-e-vitalicio'\)/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-vitalicio: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
