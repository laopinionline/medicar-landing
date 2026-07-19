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

// CONSUMO (Fase 3): cuánto crédito aplica una factura y el ítem negativo resultante. Solo saldo POSITIVO; se aplica
// hasta el total (nunca deja el total negativo). Devuelve { aplicado, itemCredito|null, totalNeto }.
//  - saldo <= 0 (incluye negativo por anulación) → aplicado 0, sin ítem, total intacto.
//  - saldo < total → aplicado = saldo, ítem "Crédito a favor −saldo", totalNeto = total − saldo.
//  - saldo >= total → aplicado = total, totalNeto = 0 (factura en $0, comprobante válido); el resto del saldo queda.
function consumoCredito(totalBruto, saldo) {
  const tb = Number(totalBruto) || 0;
  const saldoPos = Math.max(0, Number(saldo) || 0);
  const aplicado = Math.min(saldoPos, Math.max(0, tb));
  if (aplicado <= 0) return { aplicado: 0, itemCredito: null, totalNeto: tb };
  return { aplicado, itemCredito: { tipo: 'credito', descripcion: 'Crédito a favor', monto: -aplicado }, totalNeto: tb - aplicado };
}

module.exports = { origenPorSobrepago, consumoCredito };
