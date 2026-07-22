'use strict';
/* Smoke — cargos-nucleo.js (paridad). Ejecuta cargoDeEpisodio contra fixtures: cada regla (no_socio / fuera_cobertura
 * / en_carencia / siempre_extra / cubierto→sin cargo), skips (sin prestación / sin tarifa), por_km, override de
 * desenlace, sinAtrib, formato del nº de incidente. node seed/smoke-cargos-nucleo.js */
const { cargoDeEpisodio, COD_PRESTACION, fmtIncidente } = require('../functions/cargos-nucleo');
let ok = 0, fail = 0;
const eq = (l, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${l}${p ? '' : `  → ${JSON.stringify(got)} != ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };
const chk = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// tarifas activas (una por prestación); 'traslados' es por_km + siempreExtra
const TAR = [
  { id: 't-emer', prestacionId: 'emergencias', nombre: 'Emergencia', tipoCalculo: 'fija', precioBase: 12000, activo: true },
  { id: 't-tras', prestacionId: 'traslados', nombre: 'Traslado', tipoCalculo: 'por_km', precioBase: 5000, valorPorKm: 100, siempreExtra: true, activo: true },
  { id: 't-inact', prestacionId: 'urgencias', nombre: 'Urg inactiva', tipoCalculo: 'fija', precioBase: 9000, activo: false },
];
const ep = (over = {}) => Object.assign({ nroIncidente: 7, creadoEn: null, pacienteId: 'per1', pac: { nombre: 'Ana' }, codigoPresuntivo: 'rojo', atribucion: { socioId: 's1', planSnapshot: { coberturas: { emergencias: true }, enCarencia: [] } } }, over);

console.log('\nreglas');
{ // cubierto por el plan (emergencias true, no carencia, no siempreExtra) → NO genera
  const r = cargoDeEpisodio(ep(), 'e1', TAR, 2026); eq('cubierto por abono → skip sinCargo', r, { skip: 'sinCargo' });
}
{ // fuera de cobertura (emergencias no cubierta)
  const r = cargoDeEpisodio(ep({ atribucion: { socioId: 's1', planSnapshot: { coberturas: {}, enCarencia: [] } } }), 'e2', TAR, 2026);
  chk('fuera_cobertura → cargo', r.cargo && r.cargo.regla === 'fuera_cobertura' && r.cargo.precioFinal === 12000);
}
{ // en carencia (cubierta pero enCarencia incluye emergencias)
  const r = cargoDeEpisodio(ep({ atribucion: { socioId: 's1', planSnapshot: { coberturas: { emergencias: true }, enCarencia: ['emergencias'] } } }), 'e3', TAR, 2026);
  chk('en_carencia → cargo + flag', r.cargo && r.cargo.regla === 'en_carencia' && r.enCarencia === true);
}
{ // no socio (sin socioId)
  const r = cargoDeEpisodio(ep({ atribucion: null }), 'e4', TAR, 2026);
  chk('no_socio (sin atribución) → cargo + sinAtrib', r.cargo && r.cargo.regla === 'no_socio' && r.sinAtrib === true);
}
{ // siempre_extra: traslado (por_km, siempreExtra) aunque esté cubierto
  const r = cargoDeEpisodio(ep({ codigoPresuntivo: 'traslado', atribucion: { socioId: 's1', planSnapshot: { coberturas: { traslados: true }, enCarencia: [] } } }), 'e5', TAR, 2026);
  chk('siempre_extra (traslado) → cargo', r.cargo && r.cargo.regla === 'siempre_extra');
  chk('por_km: valorPorKm + kmPendiente', r.cargo && r.cargo.tipoCalculo === 'por_km' && r.cargo.valorPorKm === 100 && r.cargo.kmPendiente === true && r.cargo.km === null);
}

console.log('\nF3b — atribución por lugar');
{ // atribución por LUGAR → skip cubierto_area (NO factura a la persona)
  const r = cargoDeEpisodio(ep({ atribucion: { tipo: 'lugar', empresaId: 'eA', areaNombre: 'Los Robles', dirId: 'd1', socioId: null, planSnapshot: null } }), 'eL1', TAR, 2026);
  eq('cubierto_area (área protegida) → skip cubierto_area', r, { skip: 'cubierto_area' });
}
{ // el tipo:'lugar' MANDA aunque haya tarifa y socioId sea null (NO cae en no_socio → no le factura al cubierto)
  const r = cargoDeEpisodio(ep({ codigoPresuntivo: 'traslado', atribucion: { tipo: 'lugar', socioId: null, planSnapshot: null } }), 'eL2', TAR, 2026);
  eq('cubierto_area gana sobre siempre_extra/no_socio', r, { skip: 'cubierto_area' });
}

console.log('\nskips');
eq('código sin mapeo → sinTarifa', cargoDeEpisodio(ep({ codigoPresuntivo: 'gris' }), 'e6', TAR, 2026), { skip: 'sinTarifa' });
eq('sin código → sinTarifa', cargoDeEpisodio(ep({ codigoPresuntivo: '', desenlace: null }), 'e7', TAR, 2026), { skip: 'sinTarifa' });
eq('prestación sin tarifa activa → sinTarifa', cargoDeEpisodio(ep({ codigoPresuntivo: 'amarillo' }), 'e8', TAR, 2026), { skip: 'sinTarifa' }); // urgencias inactiva

console.log('\ndetalles');
{ // desenlace.codigoReal tiene prioridad sobre codigoPresuntivo
  const r = cargoDeEpisodio(ep({ codigoPresuntivo: 'traslado', desenlace: { codigoReal: 'rojo' }, atribucion: { socioId: 's1', planSnapshot: { coberturas: {}, enCarencia: [] } } }), 'e9', TAR, 2026);
  chk('desenlace.codigoReal manda (rojo→emergencias)', r.cargo && r.cargo.tarifaId === 't-emer');
}
{ // nroIncidenteFmt + denorm pacNombre + estado
  const r = cargoDeEpisodio(ep({ atribucion: null }), 'e10', TAR, 2026);
  eq('nroIncidenteFmt', r.cargo.nroIncidenteFmt, 'INC-2026-000007');
  eq('pacNombre denormalizado', r.cargo.pacNombre, 'Ana');
  eq('estado generado', r.cargo.estado, 'generado');
  eq('episodioId + personaId', [r.cargo.episodioId, r.cargo.personaId], ['e10', 'per1']);
}
eq('COD_PRESTACION mapa fijo', COD_PRESTACION, { rojo: 'emergencias', amarillo: 'urgencias', verde: 'atencion_medica', traslado: 'traslados' });
eq('sin nroIncidente → guion', cargoDeEpisodio(ep({ nroIncidente: null, atribucion: null }), 'e11', TAR, 2026).cargo.nroIncidenteFmt, '—');

console.log(`\n${fail ? '✗' : '✓'} smoke-cargos-nucleo: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
