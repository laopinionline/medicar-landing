'use strict';
// Smoke — callejero.js (módulo compartido). Stubea fetch + lista de prueba y verifica resolver()/alias/ambigüedad.
const path = require('path');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

const LISTA = ['Bartolomé Mitre', 'Mitre', 'Belgrano', 'Pasaje Belgrano', 'San Martín'];
global.fetch = async () => ({ ok: true, json: async () => LISTA });     // stub: cargar() lee esta lista
require(path.resolve(__dirname, '../callejero.js'));                       // el IIFE setea globalThis.Callejero

(async () => {
  await Callejero.cargar('ignorado-por-el-stub');
  const R = (d) => Callejero.resolver(d);

  t('cargado tras cargar()', Callejero.cargado() === true && Callejero.opciones().length === LISTA.length);
  // Hit directo: calle + altura → {calleId, altura}
  t('San Martín 742 → {san-martin, 742}', (() => { const r = R('San Martín 742'); return r.calleId === 'san-martin' && r.altura === 742; })());
  // Alias verdadero (F2): "Mitre" pliega a "bartolome-mitre"; y la forma completa también.
  t('Mitre 1234 → alias → bartolome-mitre', R('Mitre 1234').calleId === 'bartolome-mitre');
  t('Bartolomé Mitre 500 → bartolome-mitre (misma canónica)', R('Bartolomé Mitre 500').calleId === 'bartolome-mitre');
  // Ambigüedad: "Belgrano" y "Pasaje Belgrano" colapsan bajo la misma clave → NO adivina → null.
  t('Belgrano 100 → ambiguo → calleId null (no adivina)', R('Belgrano 100').calleId === null);
  // Fuera del callejero / rural → null.
  t('Calle Inexistente 123 → miss → null', R('Calle Inexistente 123').calleId === null);
  t('Ruta 8 km 5 → rural → null', R('Ruta 8 km 5').calleId === null);
  // Sin altura → calleId puede resolver pero altura null (el checkout exige altura>0).
  t('San Martín (sin número) → altura null (checkout lo rechaza)', R('San Martín').altura === null);
  // Normalización tolerante: "Av. San Martin 742" (sin acento, con Av.) también resuelve.
  t('normalización tolerante: "Av. San Martin 742"', R('Av. San Martin 742').calleId === 'san-martin');

  console.log(`\n${fail ? '✗' : '✓'} smoke-callejero: ${ok} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
