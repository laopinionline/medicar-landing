'use strict';
/*
 * generarFacturas — NÚCLEO PURO (sin Firebase). Fase 2: migración a CF con PARIDAD EXACTA.
 *
 * Calca 1:1 la lógica de agrupación/totales/ítems del motor client-side (app/index.html `generarFacturas`):
 * destinoDe (persona | empresa | corporativo-sin-destinatario→excluido), filtros (anulado / no-generado / ya
 * facturado / persona-sin-personaId), ítem sintético de convenio FIJO, y el ORDEN DE INSERCIÓN de los grupos
 * (abonos → cargos → convenios) que define la numeración correlativa.
 *
 * NO decide numeración ni escribe: eso vive en la CF (contador atómico + tx). Este módulo solo produce los grupos
 * y la forma de la factura, para poder smoke-testearlo y comparar contra el motor actual (shadow dry-run).
 */

// Destinatario de un abono/cargo desde su socio. null = corporativo SIN facturarA (RED corporativa → excluido).
function destinoDe(socMap, empMap, socioId) {
  const s = socMap[socioId]; const fa = s && s.facturarA;
  if (fa && fa.tipo === 'empresa') { const emp = empMap[fa.empresaId]; return { key: 'e:' + fa.empresaId, tipo: 'empresa', empresaId: fa.empresaId, razonSocial: fa.razonSocial || (emp && emp.razonSocial) || '' }; }
  if (s && s.tipoAfiliado === 'corporativo') return null;
  return { key: 'p:' + (s ? s.personaId : ''), tipo: 'persona' };
}

// Agrupa abonos+cargos+convenios-fijos del período en facturas candidatas. Devuelve grupos EN ORDEN DE INSERCIÓN
// (para que la numeración de la CF sea idéntica a la del motor actual) + los socios corporativos excluidos.
//   entrada: { abonos:[{id,...}], cargos:[{id,...}], socMap, empMap, empresasYaFacturadas:Set, periodo }
function agruparFacturas({ abonos, cargos, socMap, empMap, empresasYaFacturadas, periodo }) {
  const grupos = {}; const orden = []; const corpExcl = new Set();
  const yaFact = empresasYaFacturadas instanceof Set ? empresasYaFacturadas : new Set(empresasYaFacturadas || []);
  const push = (dest, base, item) => {
    let g = grupos[dest.key];
    if (!g) { g = grupos[dest.key] = Object.assign({ items: [] }, base); orden.push(dest.key); }
    g.items.push(item);
  };

  (abonos || []).forEach((a) => {
    if (a.estado === 'anulado') return;
    const dest = destinoDe(socMap, empMap, a.socioId); if (!dest) { corpExcl.add(a.socioId); return; }
    if (a.estado !== 'generado' || a.facturaId) return;
    if (dest.tipo === 'persona' && !a.personaId) return;
    const item = { tipo: 'abono', refId: a.id, monto: Number(a.precioFinal) || 0,
      descripcion: dest.tipo === 'empresa' ? ('Abono ' + (a.socioNombre || '') + ' · ' + (a.planNombre || '') + ' ' + (a.periodo || '')).trim() : ('Abono ' + (a.planNombre || '') + ' ' + (a.periodo || '')).trim() };
    if (dest.tipo === 'empresa') push(dest, { clienteTipo: 'empresa', clienteId: dest.empresaId, nombre: dest.razonSocial, clienteNombre: dest.razonSocial }, item);
    else push(dest, { personaId: a.personaId, socioId: a.socioId || null, nombre: a.socioNombre || '', numeroAfiliado: a.numeroAfiliado || null }, item);
  });

  (cargos || []).forEach((c) => {
    if (c.estado === 'anulado') return;
    const dest = destinoDe(socMap, empMap, c.socioId); if (!dest) { corpExcl.add(c.socioId); return; }
    if (c.estado !== 'generado' || c.facturaId) return;
    if (dest.tipo === 'persona' && !c.personaId) return;
    const item = { tipo: 'cargo', refId: c.id, monto: Number(c.precioFinal) || 0, descripcion: ((c.tarifaNombre || '—') + ' · ' + (c.nroIncidenteFmt || ('INC ' + (c.nroIncidente != null ? c.nroIncidente : '—')))) };
    if (dest.tipo === 'empresa') push(dest, { clienteTipo: 'empresa', clienteId: dest.empresaId, nombre: dest.razonSocial, clienteNombre: dest.razonSocial }, item);
    else push(dest, { personaId: c.personaId, socioId: c.socioId || null, nombre: c.pacNombre || '', numeroAfiliado: null }, item);
  });

  // Convenios FIJOS: ítem sintético (SIN refId) por empresa fija activa con ≥1 socio activo que le factura y sin
  // factura este período (idempotencia — el sintético no deja marca facturaId). Orden = Object.values(empMap).
  Object.values(empMap).forEach((emp) => {
    if (emp.activo === false || !(emp.convenio && emp.convenio.modo === 'fijo') || yaFact.has(emp.id)) return;
    const tieneSocios = Object.values(socMap).some((s) => s.activo !== false && s.facturarA && s.facturarA.tipo === 'empresa' && s.facturarA.empresaId === emp.id);
    if (!tieneSocios && emp.tipo !== 'area_protegida') return; // F4: el área protegida cubre un LUGAR (sin socios) → su fijo factura igual; corporativo sigue exigiendo socios
    push({ key: 'e:' + emp.id }, { clienteTipo: 'empresa', clienteId: emp.id, nombre: emp.razonSocial || '', clienteNombre: emp.razonSocial || '' },
      { tipo: 'convenio', descripcion: ('Convenio mensual ' + (emp.razonSocial || '') + ' · ' + periodo), monto: Number(emp.convenio.montoMensual) || 0 });
  });

  // grupos con al menos un ítem, en orden de inserción; total = Σ montos
  const lista = orden.map((k) => grupos[k]).filter((g) => g.items.length).map((g) => Object.assign({}, g, { total: g.items.reduce((s, it) => s + (Number(it.monto) || 0), 0) }));
  return { grupos: lista, corpExcl: Array.from(corpExcl) };
}

// Forma del doc factura (polimórfico persona|empresa), calco del motor. Los campos de servidor (emitidaEn/emitidaPor)
// los pone la CF; acá van periodo/nroComprobante/estado/total/items + identidad del cliente.
function facturaDoc(g, { periodo, nroComprobante }) {
  return g.clienteTipo === 'empresa'
    ? { periodo, nombre: g.nombre || '', items: g.items, total: g.total, estado: 'emitida', nroComprobante, clienteTipo: 'empresa', clienteId: g.clienteId, clienteNombre: g.clienteNombre || g.nombre || '' }
    : { periodo, personaId: g.personaId, socioId: g.socioId || null, nombre: g.nombre || '', numeroAfiliado: g.numeroAfiliado || null, items: g.items, total: g.total, estado: 'emitida', nroComprobante };
}

const fmtComprobante = (n, year) => `FC-${year}-${String(n).padStart(6, '0')}`; // calco de app: contador continuo, año cosmético

// Vencimiento (decisión Lucas): DÍA 5 del MISMO mes del período, FIN del día en hora AR (UTC-3 FIJO — Argentina sin
// DST desde 2009, calco del offset del resto del sistema). Fin del día (23:59:59) → "vence el 5" incluye todo el 5;
// vencida = hoy > venceEl recién desde el día 6. Devuelve ISO con offset (la CF lo pasa a Timestamp). null si período
// mal formado. NOTA: el día 5 existe en todos los meses (28/30/31) → sin overflow. Si se emite DESPUÉS del 5, la
// factura nace vencida (consecuencia directa de "día fijo del mes del período").
const DIA_VENCIMIENTO = 5;
function vencimientoISO(periodo) {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(String(periodo || ''))) return null;
  return `${periodo}-${String(DIA_VENCIMIENTO).padStart(2, '0')}T23:59:59-03:00`;
}

module.exports = { destinoDe, agruparFacturas, facturaDoc, fmtComprobante, vencimientoISO, DIA_VENCIMIENTO };
