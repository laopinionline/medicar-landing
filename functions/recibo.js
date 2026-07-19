'use strict';
/*
 * Recibo del pago para el socio — proyección PÚBLICA de un pago (campos limpios). El socio ve SOLO lo que hace de
 * recibo; NUNCA campos internos del cobrador. Compartido por la CF misPagos y el smoke (garantiza que lo testeado
 * es lo que corre).
 *
 * SE EXPONEN: reciboNro, monto, fecha, medio, facturaId, estado (para marcar los anulados).
 * SE OCULTAN a propósito: nota (texto interno del cobrador), registradoPor (uid del empleado), registradoEn,
 *   pagadorId/pagadorTipo, motivoAnulacion/anuladoPor (internos).
 */
function reciboPublico(p) {
  const d = p || {};
  return {
    reciboNro: d.reciboNro || null,
    monto: Number(d.monto) || 0,
    fecha: d.fecha || null,       // 'YYYY-MM-DD'
    medio: d.medio || null,       // efectivo | transferencia | deposito | pasarela
    facturaId: d.facturaId || null,
    estado: d.estado || null,     // registrado | anulado (el cliente marca los anulados)
  };
}

module.exports = { reciboPublico };
