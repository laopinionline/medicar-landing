'use strict';
/* Smoke — VITALICIO GRUPAL (diseño B) + herencia de plan del titular. node seed/smoke-vitalicio-grupal.js */
const fs = require('fs'), path = require('path');
const R = (p) => path.resolve(__dirname, '..', p);
const { agruparFacturas } = require(R('functions/facturas-nucleo'));
const { cargoDeEpisodio } = require(R('functions/cargos-nucleo'));
const app = fs.readFileSync(R('app/index.html'), 'utf8');
const fn = fs.readFileSync(R('functions/index.js'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// --- 1) facturas-nucleo: esVitalicio GRUPAL (dep de titular vitalicio → sin factura, vía socMap) ---
const socMap = {
  tit: { personaId: 'pt', activo: true, vitalicio: true },                 // titular VITALICIO
  dep: { personaId: 'pd', activo: true, titularSocioId: 'tit' },           // dependiente SIN flag propio
  titN: { personaId: 'ptn', activo: true, planId: 'plan1' },               // titular NORMAL
  depN: { personaId: 'pdn', activo: true, titularSocioId: 'titN' },        // dependiente de titular normal
};
const abonos = [
  { id: 'a-dep', socioId: 'dep', personaId: 'pd', estado: 'generado', precioFinal: 5000, planNombre: 'X', periodo: '2099-01', socioNombre: 'Dep' },
  { id: 'a-depN', socioId: 'depN', personaId: 'pdn', estado: 'generado', precioFinal: 5000, planNombre: 'X', periodo: '2099-01', socioNombre: 'DepN' },
];
const cargos = [
  { id: 'c-dep', socioId: 'dep', personaId: 'pd', estado: 'generado', precioFinal: 3000, tarifaNombre: 'T', nroIncidente: 1 },
  { id: 'c-depN', socioId: 'depN', personaId: 'pdn', estado: 'generado', precioFinal: 3000, tarifaNombre: 'T', nroIncidente: 2 },
];
const r = agruparFacturas({ abonos, cargos, socMap, empMap: {}, empresasYaFacturadas: [], periodo: '2099-01' });
t('dep de titular VITALICIO → NINGUNA factura (esVitalicio grupal por socMap)', !r.grupos.some((g) => g.personaId === 'pd'));
t('dep de titular NORMAL → SÍ factura (no es vitalicio)', r.grupos.some((g) => g.personaId === 'pdn'));
t('esVitalicio grupal NO afecta a un socio sin titular vitalicio', r.grupos.some((g) => g.personaId === 'pdn'));

// --- 2) cargoDeEpisodio: snapshot HEREDADO del titular ---
const tar = [{ id: 't-emer', prestacionId: 'emergencias', nombre: 'E', tipoCalculo: 'fija', precioBase: 12000, activo: true }];
const ep = (planSnapshot) => ({ nroIncidente: 1, pacienteId: 'pd', pac: { nombre: 'D' }, codigoPresuntivo: 'rojo', atribucion: { socioId: 'dep', planSnapshot } });
// (a) dep de vitalicio → snapshot {vitalicio:true} → cubierto_vitalicio
t('dep de vitalicio: snapshot heredado {vitalicio:true} → cubierto_vitalicio (sin cargo)', JSON.stringify(cargoDeEpisodio(ep({ vitalicio: true, enCarencia: [] }), 'e1', tar, 2026)) === JSON.stringify({ skip: 'cubierto_vitalicio' }));
// (b) dep de titular normal cuyo plan CUBRE emergencias → sinCargo (antes: fuera_cobertura)
t('dep de titular NORMAL cubierto por el plan del grupo → sinCargo (ya NO fuera_cobertura)', JSON.stringify(cargoDeEpisodio(ep({ planId: 'plan1', coberturas: { emergencias: true }, enCarencia: [], heredadoDe: 'titular' }), 'e2', tar, 2026)) === JSON.stringify({ skip: 'sinCargo' }));
// (c) dep de titular normal cuyo plan NO cubre → fuera_cobertura (correcto: el plan del grupo no lo cubre)
t('dep de titular normal NO cubierto por el plan del grupo → fuera_cobertura (correcto)', (cargoDeEpisodio(ep({ planId: 'plan1', coberturas: {}, enCarencia: [], heredadoDe: 'titular' }), 'e3', tar, 2026).cargo || {}).regla === 'fuera_cobertura');

// --- 3) resolverAtribucion (client): el dependiente HEREDA el snapshot del titular ---
t('resolverAtribucion: rama dependiente sin plan propio resuelve al TITULAR', /\} else if\(socio\.titularSocioId\)\{/.test(app) && /const ts=await db\.collection\('socios'\)\.doc\(socio\.titularSocioId\)\.get\(\)/.test(app));
t('resolverAtribucion: titular vitalicio → vitalicioSnap; titular normal → buildPlanSnap heredado', /if\(tit\.vitalicio===true\) planSnapshot=vitalicioSnap\(\)/.test(app) && /buildPlanSnap\(tps\.data\(\), tit\.planId, true\)/.test(app));

// --- 4) IA: dependiente-con-cuenta hereda el vitalicio/plan del titular ---
t('IA: resuelve titular si el dep no tiene plan/flag propio', /!vitalicio && !planId && socio\.titularSocioId/.test(fn) && /tit\.vitalicio === true\) vitalicio = true; else if \(tit\.planId\) planId = tit\.planId/.test(fn));
t('IA: vitalicio (propio o heredado) → plan.vitalicio true (buildContexto dice "sin cuota")', /if \(vitalicio\) \{[\s\S]{0,80}vitalicio: true \}/.test(fn));

// --- 5) PANEL: chip VITALICIO dinámico + "Grupo <titular>" ---
t('panel: vitalicioChip dinámico (propio OR titular por titularSocioId)', /function vitalicioChip\(s\)\{ const propio=!!\(s && s\.vitalicio===true\); const t=propio\?null:afTitularDe\(s\)/.test(app));
t('panel: afGrupoChip "Grupo <nombreVista del titular>"', /function afGrupoChip\(s\)\{ const t=afTitularDe\(s\); return t \? `<span[\s\S]{0,120}Grupo \$\{esc\(t\.nombreVista/.test(app) && /\$\{afGrupoChip\(s\)\}/.test(app));

console.log(`\n${fail ? '✗' : '✓'} smoke-vitalicio-grupal: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
