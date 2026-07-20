'use strict';
/* Smoke — Turnos Fase A (grupo familiar). Lógica PURA en memoria:
 *  (A) derivación de titularPersonaId (calco de resolverDestino): cabeza del grupo según caller/para.
 *  (B) merge/dedupe de las dos queries de "Mis turnos" (personaId==yo + titularPersonaId==yo).
 *  (C) "de quién" es el turno (propio vs dependiente). node seed/smoke-turnos-grupo.js */
let ok = 0, fail = 0;
const eq = (l, got, exp) => { const p = JSON.stringify(got) === JSON.stringify(exp); console.log(`${p ? '✓' : '✗ FALLO'} ${l}${p ? '' : `  → ${JSON.stringify(got)} != ${JSON.stringify(exp)}`}`); p ? ok++ : fail++; };

// (A) calco de resolverDestino: devuelve el titularPersonaId (cabeza) o {error}
function grupoTitular(socios, caller, para) {
  if (!para || para === caller) {
    const s = socios.find((x) => x.personaId === caller && x.activo !== false) || socios.find((x) => x.personaId === caller);
    return (s && s.titularPersonaId) ? s.titularPersonaId : caller; // dependiente-con-login → su titular; titular → él mismo
  }
  const dep = socios.find((x) => x.personaId === para && x.titularPersonaId === caller && x.activo !== false);
  if (!dep) return { error: 'permission-denied' };
  return caller; // el dependiente rueda a su titular = el caller
}
const SOC = [
  { personaId: 'pT', activo: true },                       // titular (sin titularPersonaId → cabeza él mismo)
  { personaId: 'pD', titularPersonaId: 'pT', activo: true },// dependiente CON login
  { personaId: 'pH', titularPersonaId: 'pT', activo: true },// hijo (dependiente sin login relevante)
];

console.log('\n(A) titularPersonaId = cabeza del grupo');
eq('titular reserva para sí → cabeza = él',            grupoTitular(SOC, 'pT', 'pT'), 'pT');
eq('titular reserva sin para (=self) → cabeza = él',   grupoTitular(SOC, 'pT', ''), 'pT');
eq('titular reserva para su hijo → cabeza = titular',  grupoTitular(SOC, 'pT', 'pH'), 'pT');
eq('dependiente-con-login reserva para sí → cabeza = SU titular', grupoTitular(SOC, 'pD', 'pD'), 'pT');
eq('reservar para NO-dependiente → permission-denied', grupoTitular(SOC, 'pT', 'pX'), { error: 'permission-denied' });
eq('caller sin socio (staff/edge) → cabeza = él mismo', grupoTitular([], 'pZ', 'pZ'), 'pZ');

// (B) merge/dedupe de "Mis turnos"
function misTurnos(propios, grupo) { const m = {}; propios.forEach((t) => { m[t.id] = t; }); grupo.forEach((t) => { m[t.id] = t; }); return Object.values(m); }
console.log('\n(B) merge/dedupe de las dos queries');
{
  // titular pT: propios = [tOwn]; grupo (titularPersonaId==pT) = [tOwn, tHijo] → dedupe → 2
  const tOwn = { id: 'tOwn', personaId: 'pT', titularPersonaId: 'pT' };
  const tHijo = { id: 'tHijo', personaId: 'pH', titularPersonaId: 'pT' };
  const r = misTurnos([tOwn], [tOwn, tHijo]);
  eq('titular: 2 turnos (propio + hijo), sin duplicar tOwn', r.map((t) => t.id).sort(), ['tHijo', 'tOwn']);
}
{
  // dependiente-con-login pD: propios = [tDep]; grupo (titularPersonaId==pD) = [] (no es cabeza) → 1
  const tDep = { id: 'tDep', personaId: 'pD', titularPersonaId: 'pT' };
  const r = misTurnos([tDep], []);
  eq('dependiente-con-login: solo el suyo (no pierde autonomía)', r.map((t) => t.id), ['tDep']);
}

// (C) "de quién" es el turno
const deQuien = (t, yo) => (t.personaId === yo) ? 'PROPIO' : ('para ' + t.nombreVista);
console.log('\n(C) "de quién" es cada turno');
eq('turno propio → PROPIO',            deQuien({ personaId: 'pT', nombreVista: 'Yo' }, 'pT'), 'PROPIO');
eq('turno de un dependiente → para X', deQuien({ personaId: 'pH', nombreVista: 'Hijo Pérez' }, 'pT'), 'para Hijo Pérez');

console.log(`\n${fail ? '✗' : '✓'} smoke-turnos-grupo: ${ok} ok, ${fail} fallo(s)\n`);
process.exit(fail ? 1 : 0);
