'use strict';
/* Smoke — BONIFICADO de Área Protegida: flag propio {bonificado,origen,empresaId} · motor esSinCuota = vitalicio ||
   bonificado (cargos-núcleo + facturas-núcleo, EJECUTADOS) · vitalicio real intacto y distinguible · alta 1-click /
   otra-persona · baja→aviso→degradar · IA copy vitalicio reusado · empresa vieja sin DNI no rompe. node seed/smoke-bonificado.js */
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const app = R('app/index.html');
const fns = R('functions/index.js');
const sw = R('socio/sw.js');
const socio = R('socio/index.html');
const { agruparFacturas } = require('../functions/facturas-nucleo.js');
const { cargoDeEpisodio } = require('../functions/cargos-nucleo.js');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ─────────── MOTOR facturas-núcleo: bonificado sin factura (esSinCuota), vitalicio sigue skipeando ───────────
const socMap = {
  sNorm: { personaId: 'pN', tipoAfiliado: 'directo' },
  sVit:  { personaId: 'pV', tipoAfiliado: 'directo', vitalicio: true },
  sBon:  { personaId: 'pB', tipoAfiliado: 'directo', bonificado: true, origen: 'area_protegida', empresaId: 'e1' },
};
const mkAbono = (socioId, personaId) => ({ id: 'a_' + socioId, socioId, personaId, estado: 'generado', precioFinal: 1000, planNombre: 'X', periodo: '2099-01' });
const res = agruparFacturas({
  abonos: [mkAbono('sNorm', 'pN'), mkAbono('sVit', 'pV'), mkAbono('sBon', 'pB')],
  cargos: [], socMap, empMap: {}, empresasYaFacturadas: new Set(), periodo: '2099-01',
});
const facturados = (res.grupos || []).map((g) => g.personaId).filter(Boolean);
t('facturas-núcleo: el socio NORMAL sí factura (grupo persona presente)', facturados.includes('pN'));
t('facturas-núcleo: el VITALICIO NO factura (skip intacto)', !facturados.includes('pV'));
t('facturas-núcleo: el BONIFICADO NO factura (esSinCuota = vitalicio || bonificado)', !facturados.includes('pB'));

// cargo bonificado por episodio (planSnapshot.bonificado) → cubierto_bonificado (distinto de cubierto_vitalicio)
const tarifas = [{ id: 'tf', prestacionId: 'emergencias', activo: true, precioBase: 5000, tipoCalculo: 'fija' }];
const epBon = { desenlace: { codigoReal: 'rojo' }, atribucion: { tipo: 'persona', socioId: 'sBon', planSnapshot: { bonificado: true, enCarencia: [] } } };
const epVit = { desenlace: { codigoReal: 'rojo' }, atribucion: { tipo: 'persona', socioId: 'sVit', planSnapshot: { vitalicio: true, enCarencia: [] } } };
t('cargos-núcleo: episodio de BONIFICADO → skip cubierto_bonificado', cargoDeEpisodio(epBon, 'ep1', tarifas, 2099).skip === 'cubierto_bonificado');
t('cargos-núcleo: episodio de VITALICIO → skip cubierto_vitalicio (intacto)', cargoDeEpisodio(epVit, 'ep2', tarifas, 2099).skip === 'cubierto_vitalicio');

// ─────────── ABONOS (cliente): skip del bonificado con contador propio ───────────
t('generarAbonos: saltea el bonificado (contador propio)', /if\(socio\.bonificado===true\)\{ rep\.bonificados\+\+; continue; \}/.test(app));
t('generarCargos: saltea el bonificado (cubierto_bonificado, paridad núcleo)', /planSnapshot\.bonificado===true\)\{ rep\.cubierto_bonificado/.test(app));
t('rep del cliente y del server tienen cubierto_bonificado', /cubierto_bonificado:0/.test(app) && /cubierto_bonificado: 0/.test(fns));

// ─────────── resolverAtribucion: bonificadoSnap (cobertura total, trazable) ───────────
t('resolverAtribucion: rama bonificado → bonificadoSnap (cobertura total)', /socio\.bonificado===true\)\{[\s\S]{0,80}planSnapshot=bonificadoSnap\(\)/.test(app));
t('bonificadoSnap marca bonificado:true (no vitalicio)', /bonificadoSnap=\(\)=>\(\{ bonificado:true/.test(app));

// ─────────── ALTA de empresa: DNI + fecha nac del contacto (habilita 1-click) ───────────
t('empresa alta: campos contactoDni + contactoFechaNac', /emp-contacto-dni/.test(app) && /emp-contacto-fnac/.test(app));
t('empGuardarNuevo persiste contactoDni + contactoFechaNac', /contactoDni:\(document\.getElementById\('emp-contacto-dni'\)/.test(app) && /contactoFechaNac:\(document\.getElementById\('emp-contacto-fnac'\)/.test(app));
t('empFormEdit permite completar DNI/fecha nac (compat empresa vieja)', /e\.tipo==='area_protegida'\?`<div class="field"><label>DNI del contacto/.test(app));

// ─────────── PASO Dependiente bonificado: default 1-click + otra persona ───────────
t('empBonifBlock enganchado al form del área', /empDireccionesBlock\(id\)\+empBonifBlock\(e\)/.test(app));
t('default 1-click: botón "Bonificar al contacto" gateado por datos del contacto', /Bonificar al contacto \(1 click\)/.test(app) && /tieneDatos\?'':'disabled'/.test(app));
t('crear default usa contacto + domicilio del área (1ª dirección)', /function empBonifCrearDefault[\s\S]{0,900}empBonifCrear\(empresaId, \{ dni:e\.contactoDni/.test(app));
t('"Otra persona": form con apellido+nombre+DNI+fecha nac', /function empBonifOtraForm[\s\S]{0,520}bonif-ape[\s\S]{0,200}bonif-dni[\s\S]{0,160}bonif-fnac/.test(app));
t('otra persona: domicilio propio o del área', /empBonifDomToggle/.test(app) && /Usar domicilio del área/.test(app));
t('empBonifCrear setea el flag propio bonificado+origen+empresaId (afiliado directo)', /bonificado:true, origen:'area_protegida', empresaId,/.test(app));
t('creación gateada a admin/superadmin (la regla enforza)', /function empBonifCrearDefault\(empresaId\)\{\s*if\(!esAdminOSuper\(\)\)/.test(app));

// ─────────── BAJA del área → aviso + degradar ───────────
t('baja del área: flash de aviso si hay bonificado activo', /upd\.activo===false\)\{[\s\S]{0,320}quedó de baja y tiene un dependiente bonificado activo/.test(app));
t('bloque bonificado muestra aviso ⚠️ cuando el área está de baja', /activo && e\.activo===false\)/.test(app) && /está dada de baja, pero su dependiente bonificado/.test(app));
t('degradar a pagador: bonificado true→false, conserva origen/empresaId', /function empBonifDegradar[\s\S]{0,480}\{ bonificado:false, degradadoEn:FV\(\) \}/.test(app));
t('degradar gateado a admin + confirm', /function empBonifDegradar\(socioId, empresaId\)\{\s*if\(!esAdminOSuper\(\)\)/.test(app) && /EMPIEZA a facturar/.test(app));

// ─────────── IA: copy vitalicio reusado (sin nombrar área) ───────────
t('IA buildContexto: sin cuota = vitalicio || bonificado', /socio\.vitalicio === true \|\| socio\.bonificado === true/.test(fns));
t('IA: el bonificado NO puede autogestionar plan (como vitalicio)', /if \(socio\.vitalicio === true \|\| socio\.bonificado === true\) throw new HttpsError\('failed-precondition', 'Tu plan lo gestiona MEDICAR\.'\)/.test(fns));

// ─────────── CARA AL SOCIO: credencial pelada + rótulo INTERNO ───────────
t('socio: esVit = vitalicio || bonificado (credencial pelada, sin nombrar)', /const esVit = !!\(socio && \(socio\.vitalicio===true \|\| socio\.bonificado===true\)\)/.test(socio));
t('socio: bonificado tampoco autogestiona plan', /S\.cred\.socio\.vitalicio===true \|\| S\.cred\.socio\.bonificado===true/.test(socio));
t('panel: chip INTERNO "BONIFICADO" distinto del VITALICIO', /function bonificadoChip/.test(app) && /\$\{vitalicioChip\(s\)\} \$\{bonificadoChip\(s\)\}/.test(app));

// ─────────── SW bump ───────────
t('socio SW bumpeado (≥ v47)', /medicar-socio-v(4[7-9]|[5-9]\d)/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-bonificado: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
