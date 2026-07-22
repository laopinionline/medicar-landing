'use strict';
/* Smoke — facturas-nucleo.js (paridad Fase 2). Ejecuta agruparFacturas/facturaDoc contra fixtures y verifica cada
 * camino del motor: agrupación persona/empresa, filtros (anulado/no-generado/ya-facturado/persona-sin-personaId),
 * corporativo excluido, ítem sintético de convenio fijo + idempotencia, orden de inserción (numeración), totales,
 * y la forma polimórfica del doc. node seed/smoke-facturas-nucleo.js */
const { agruparFacturas, facturaDoc, fmtComprobante } = require('../functions/facturas-nucleo');

let ok = 0, fail = 0;
const eq = (label, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${label}${p ? '' : `\n    got ${JSON.stringify(got)}\n    exp ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };

// Fixtures: socios (pA persona, pB persona sin login-irrelevante, corp sin facturarA, corpEmp factura a empresa E1)
const socMap = {
  sA: { id: 'sA', personaId: 'pA', tipoAfiliado: 'individual', activo: true },
  sB: { id: 'sB', personaId: 'pB', tipoAfiliado: 'individual', activo: true },
  sCorp: { id: 'sCorp', personaId: 'pC', tipoAfiliado: 'corporativo', activo: true }, // sin facturarA → RED → excluido
  sEmp: { id: 'sEmp', personaId: 'pE', tipoAfiliado: 'corporativo', activo: true, facturarA: { tipo: 'empresa', empresaId: 'E1', razonSocial: 'DEMO SA' } },
};
const empMap = {
  E1: { id: 'E1', razonSocial: 'DEMO SA', activo: true, convenio: { modo: 'per_capita' } }, // per cápita: NO ítem sintético
  E2: { id: 'E2', razonSocial: 'FIJO SA', activo: true, convenio: { modo: 'fijo', montoMensual: 80000 } },
};
const socMapConFijo = Object.assign({}, socMap, { sFijo: { id: 'sFijo', personaId: 'pF', tipoAfiliado: 'corporativo', activo: true, facturarA: { tipo: 'empresa', empresaId: 'E2', razonSocial: 'FIJO SA' } } });

console.log('\n(1) persona — abono + cargo se agrupan; base del PRIMER ítem (abono); total suma');
{
  const abonos = [{ id: 'ab1', socioId: 'sA', personaId: 'pA', estado: 'generado', precioFinal: 1000, planNombre: 'Plan X', periodo: '2099-07', socioNombre: 'Ana', numeroAfiliado: '100' }];
  const cargos = [{ id: 'cg1', socioId: 'sA', personaId: 'pA', estado: 'generado', precioFinal: 500, tarifaNombre: 'Traslado', nroIncidente: 7, pacNombre: 'Ana-pac' }];
  const { grupos } = agruparFacturas({ abonos, cargos, socMap, empMap: {}, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('un grupo persona', grupos.length, 1);
  eq('2 ítems (abono+cargo)', grupos[0].items.length, 2);
  eq('nombre = del abono (socioNombre)', grupos[0].nombre, 'Ana');
  eq('numeroAfiliado del abono', grupos[0].numeroAfiliado, '100');
  eq('total 1500', grupos[0].total, 1500);
  eq('desc abono', grupos[0].items[0].descripcion, 'Abono Plan X 2099-07');
  eq('desc cargo', grupos[0].items[1].descripcion, 'Traslado · INC 7');
}

console.log('\n(2) filtros: anulado / no-generado / ya-facturado / persona-sin-personaId → NO entran');
{
  const abonos = [
    { id: 'a-anul', socioId: 'sA', personaId: 'pA', estado: 'anulado', precioFinal: 1000 },
    { id: 'a-borr', socioId: 'sA', personaId: 'pA', estado: 'borrador', precioFinal: 1000 },
    { id: 'a-fact', socioId: 'sA', personaId: 'pA', estado: 'generado', precioFinal: 1000, facturaId: 'F-viejo' },
    { id: 'a-noper', socioId: 'sA', personaId: null, estado: 'generado', precioFinal: 1000 },
  ];
  const { grupos } = agruparFacturas({ abonos, cargos: [], socMap, empMap: {}, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('ningún grupo (todos filtrados)', grupos.length, 0);
}

console.log('\n(3) corporativo SIN facturarA → excluido (corpExcl), no factura');
{
  const abonos = [{ id: 'ab-c', socioId: 'sCorp', personaId: 'pC', estado: 'generado', precioFinal: 1000 }];
  const { grupos, corpExcl } = agruparFacturas({ abonos, cargos: [], socMap, empMap: {}, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('sin grupo', grupos.length, 0);
  eq('corpExcl = [sCorp]', corpExcl, ['sCorp']);
}

console.log('\n(4) empresa (facturarA) — ítem va al grupo empresa con descripción enriquecida');
{
  const abonos = [{ id: 'ab-e', socioId: 'sEmp', personaId: 'pE', estado: 'generado', precioFinal: 3000, planNombre: 'Corp', periodo: '2099-07', socioNombre: 'Emp Uno' }];
  const { grupos } = agruparFacturas({ abonos, cargos: [], socMap, empMap, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('un grupo empresa', grupos.length, 1);
  eq('clienteTipo empresa', grupos[0].clienteTipo, 'empresa');
  eq('clienteId E1', grupos[0].clienteId, 'E1');
  eq('desc con nombre del socio', grupos[0].items[0].descripcion, 'Abono Emp Uno · Corp 2099-07');
  eq('sin personaId en el grupo empresa', grupos[0].personaId, undefined);
}

console.log('\n(5) convenio FIJO — ítem sintético (sin refId) si hay socio activo; idempotente por empresasYaFacturadas');
{
  const r1 = agruparFacturas({ abonos: [], cargos: [], socMap: socMapConFijo, empMap, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('un grupo (convenio fijo E2)', r1.grupos.length, 1);
  eq('ítem convenio sin refId', r1.grupos[0].items[0].refId, undefined);
  eq('monto fijo 80000', r1.grupos[0].total, 80000);
  eq('desc convenio', r1.grupos[0].items[0].descripcion, 'Convenio mensual FIJO SA · 2099-07');
  const r2 = agruparFacturas({ abonos: [], cargos: [], socMap: socMapConFijo, empMap, empresasYaFacturadas: new Set(['E2']), periodo: '2099-07' });
  eq('ya facturada → sin grupo (idempotente)', r2.grupos.length, 0);
  const r3 = agruparFacturas({ abonos: [], cargos: [], socMap, empMap, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('E2 sin socios activos → sin grupo', r3.grupos.length, 0);
}

console.log('\n(6) orden de inserción (abonos → cargos → convenios) define la numeración');
{
  const abonos = [{ id: 'ab-B', socioId: 'sB', personaId: 'pB', estado: 'generado', precioFinal: 100, socioNombre: 'Beto' }];
  const cargos = [{ id: 'cg-A', socioId: 'sA', personaId: 'pA', estado: 'generado', precioFinal: 200, tarifaNombre: 'T', nroIncidente: 1, pacNombre: 'Ana' }];
  const { grupos } = agruparFacturas({ abonos, cargos, socMap: socMapConFijo, empMap, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  // orden esperado: pB (abono) → pA (cargo) → E2 (convenio fijo)
  eq('3 grupos', grupos.length, 3);
  eq('orden: pB, pA, empresa', grupos.map((g) => g.clienteTipo === 'empresa' ? g.clienteId : g.personaId), ['pB', 'pA', 'E2']);
  // numeración provisional desde contador 40
  let n = 40; const nros = grupos.map((g) => fmtComprobante(++n, 2026));
  eq('numeración correlativa', nros, ['FC-2026-000041', 'FC-2026-000042', 'FC-2026-000043']);
}

console.log('\n(7) facturaDoc — forma polimórfica persona vs empresa');
{
  const gP = { personaId: 'pA', socioId: 'sA', nombre: 'Ana', numeroAfiliado: '100', items: [{ tipo: 'abono', refId: 'ab1', monto: 1000, descripcion: 'd' }], total: 1000 };
  const dP = facturaDoc(gP, { periodo: '2099-07', nroComprobante: 'FC-2026-000041' });
  eq('persona: keys', Object.keys(dP).sort(), ['estado', 'items', 'nombre', 'nroComprobante', 'numeroAfiliado', 'periodo', 'personaId', 'socioId', 'total']);
  eq('persona: estado emitida', dP.estado, 'emitida');
  const gE = { clienteTipo: 'empresa', clienteId: 'E2', clienteNombre: 'FIJO SA', nombre: 'FIJO SA', items: [{ tipo: 'convenio', monto: 80000, descripcion: 'c' }], total: 80000 };
  const dE = facturaDoc(gE, { periodo: '2099-07', nroComprobante: 'FC-2026-000042' });
  eq('empresa: SIN personaId', 'personaId' in dE, false);
  eq('empresa: clienteTipo', dE.clienteTipo, 'empresa');
  eq('empresa: clienteId', dE.clienteId, 'E2');
}

console.log('\n(8) F4 — ÁREA PROTEGIDA fijo factura SIN socios; corporativo fijo sin socios NO factura');
{
  const empArea = { E3: { id: 'E3', tipo: 'area_protegida', razonSocial: 'Barrio Los Robles', activo: true, convenio: { modo: 'fijo', montoMensual: 50000 } } };
  const empCorp = { E2: { id: 'E2', tipo: 'corporativo', razonSocial: 'FIJO SA', activo: true, convenio: { modo: 'fijo', montoMensual: 80000 } } };
  // socMap base NO tiene socios que facturen a E3 ni a E2.
  const rArea = agruparFacturas({ abonos: [], cargos: [], socMap, empMap: empArea, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('área protegida fijo SIN socios → factura igual (1 grupo)', rArea.grupos.length, 1);
  eq('  ítem convenio del área', rArea.grupos[0].items[0].descripcion, 'Convenio mensual Barrio Los Robles · 2099-07');
  eq('  monto del área', rArea.grupos[0].total, 50000);
  const rCorp = agruparFacturas({ abonos: [], cargos: [], socMap, empMap: empCorp, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('corporativo fijo SIN socios → NO factura (0 grupos)', rCorp.grupos.length, 0);
  const rDup = agruparFacturas({ abonos: [], cargos: [], socMap, empMap: empArea, empresasYaFacturadas: new Set(['E3']), periodo: '2099-07' });
  eq('área ya facturada este período → no re-factura (idempotente)', rDup.grupos.length, 0);
  const rPC = agruparFacturas({ abonos: [], cargos: [], socMap, empMap: { E4: { id: 'E4', tipo: 'area_protegida', activo: true, convenio: { modo: 'per_capita' } } }, empresasYaFacturadas: new Set(), periodo: '2099-07' });
  eq('área per_capita (no fijo) → 0 grupos', rPC.grupos.length, 0);
}

console.log(`\n${fail ? '✗' : '✓'} smoke-facturas-nucleo: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
