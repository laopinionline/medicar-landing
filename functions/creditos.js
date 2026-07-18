'use strict';
/*
 * Crédito a cuenta (saldo a favor del socio) — núcleo PURO (sin Firebase), para smoke-testear la fórmula del sobrepago.
 *
 * Modelo HÍBRIDO (decisión de Lucas): ledger append-only `creditos/` (auditoría) + doc-saldo `creditos_saldo/{personaId}`
 * (atomicidad). Este módulo solo tiene la lógica pura; la CF/trigger la usa dentro de una tx.
 *
 * FASE 1 = SOLO genera crédito (al detectar sobrepago) y lo muestra. Nada lo consume todavía.
 */

// El `origen` que aporta ESTE pago al sobrepago de su factura. Cada pago deriva su porción MARGINAL del excedente:
//   exceso = Σpagos registrados (incluido este) − total factura ;  origen = min(montoDeEstePago, max(0, exceso)).
// Así la suma de los origenes de todos los pagos == excedente total, sin depender del orden (con el doc-id determinista
// orig_{pagoId} que garantiza idempotencia). Nunca negativo, nunca mayor que lo que puso este pago.
function origenPorSobrepago(montoPago, sumaRegistrados, totalFactura) {
  const mp = Number(montoPago) || 0;
  const exceso = (Number(sumaRegistrados) || 0) - (Number(totalFactura) || 0);
  if (exceso <= 0) return 0;          // la factura no está sobre-pagada → sin crédito
  return Math.min(mp, exceso);        // este pago aporta como mucho su propio monto al excedente
}

module.exports = { origenPorSobrepago };
