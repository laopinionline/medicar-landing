'use strict';
/*
 * generarCargos — NÚCLEO PURO (sin Firebase). Migración a CF con PARIDAD EXACTA (calco de app/index.html
 * `generarCargos`). Decide, por episodio CERRADO, si genera un cargo y con qué regla/tarifa. El contable dispara la CF
 * y NO lee episodios: el servidor los lee (Admin SDK), este módulo solo tiene la lógica.
 */

// Mapa fijo código de triage/desenlace → prestación (calco literal de app COD_PRESTACION).
const COD_PRESTACION = { rojo: 'emergencias', amarillo: 'urgencias', verde: 'atencion_medica', traslado: 'traslados' };
const fmtIncidente = (n, year) => `INC-${year}-${String(n).padStart(6, '0')}`; // calco de app

// Decide el cargo de UN episodio. Devuelve { skip:'sinTarifa'|'sinCargo' } o { cargo, sinAtrib, enCarencia }.
// El cargo NO trae los campos de servidor (generadoEn/generadoPor) — los agrega la CF.
function cargoDeEpisodio(ep, epId, tarifas, anioIncidente) {
  const codigo = (ep.desenlace && ep.desenlace.codigoReal) || ep.codigoPresuntivo || '';
  const prestacionId = COD_PRESTACION[codigo] || null;
  if (!prestacionId) return { skip: 'sinTarifa' };                              // sin mapeo a prestación
  const tarifa = (tarifas || []).find((t) => t.activo !== false && t.prestacionId === prestacionId);
  if (!tarifa) return { skip: 'sinTarifa' };                                    // no hay tarifa activa → no cobra en 0
  const atrib = ep.atribucion || null; const sinAtrib = !atrib;
  const socioId = (atrib && atrib.socioId) ? atrib.socioId : null;
  const cob = (atrib && atrib.planSnapshot && atrib.planSnapshot.coberturas) ? atrib.planSnapshot.coberturas : {};
  const enCar = (atrib && atrib.planSnapshot && Array.isArray(atrib.planSnapshot.enCarencia)) ? atrib.planSnapshot.enCarencia : [];
  let regla = null;
  if (socioId == null) regla = 'no_socio';                                      // a. no socio / histórico sin atribución
  else if (cob[prestacionId] !== true) regla = 'fuera_cobertura';              // b. fuera de cobertura
  else if (enCar.includes(prestacionId)) regla = 'en_carencia';               // b2. cubierta pero en carencia → se cobra
  else if (tarifa.siempreExtra) regla = 'siempre_extra';                       // c. siempre-extra
  else return { skip: 'sinCargo' };                                            // d. cubierto por el abono → no genera
  const porKm = tarifa.tipoCalculo === 'por_km';
  const base = Number(tarifa.precioBase) || 0;
  const cargo = {
    episodioId: epId,
    nroIncidente: (ep.nroIncidente != null ? ep.nroIncidente : null),
    nroIncidenteFmt: (ep.nroIncidente != null ? fmtIncidente(ep.nroIncidente, anioIncidente) : '—'),
    personaId: ep.pacienteId || null,
    socioId,
    pacNombre: (ep.pac && ep.pac.nombre) || '',
    regla,
    tarifaId: tarifa.id, tarifaNombre: tarifa.nombre || '', tipoCalculo: tarifa.tipoCalculo || 'fija',
    precioSugerido: base,
    valorPorKm: (porKm ? (Number(tarifa.valorPorKm) || 0) : 0),
    km: null, kmPendiente: porKm,
    precioFinal: base,
    motivoAjuste: null,
    estado: 'generado',
  };
  return { cargo, sinAtrib, enCarencia: regla === 'en_carencia' };
}

module.exports = { COD_PRESTACION, fmtIncidente, cargoDeEpisodio };
