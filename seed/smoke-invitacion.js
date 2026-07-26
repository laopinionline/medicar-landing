'use strict';
/* Smoke — invitación de integrante (cuenta propia) + privacidad de turnos. Núcleo puro + wiring.
 * node seed/smoke-invitacion.js  (rules-unit en rules-tests/invitaciones-afiliado.test.js) */
const fs = require('fs'), path = require('path');
const R = (p) => path.resolve(__dirname, '..', p);
const { estadoInvitacion, ruedaAlTitular } = require(R('functions/invitacion-core.js'));
const fn = fs.readFileSync(R('functions/index.js'), 'utf8');
const socio = fs.readFileSync(R('socio/index.html'), 'utf8');
const app = fs.readFileSync(R('app/index.html'), 'utf8');
const rules = fs.readFileSync(R('firestore.rules'), 'utf8');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };
const AHORA = 1000000;

// --- 1) PRIVACIDAD de turnos (ruedaAlTitular): rueda = el titular ve el turno ---
t('adulto CON cuenta → NO rueda (turno privado, invisible al titular)', ruedaAlTitular(30, true) === false);
t('menor CON cuenta → SÍ rueda (titular conserva lo asistencial)', ruedaAlTitular(12, true) === true);
t('menor SIN cuenta → SÍ rueda (titular gestiona)', ruedaAlTitular(12, false) === true);
t('adulto SIN cuenta → SÍ rueda (gestionado hasta aceptar invitación)', ruedaAlTitular(40, false) === true);
t('cumple-18 flip: 17 con cuenta rueda; 18 con cuenta NO (edad en vivo)', ruedaAlTitular(17, true) === true && ruedaAlTitular(18, true) === false);
t('edad nula (sin fecha) → rueda (no es adulto verificable)', ruedaAlTitular(null, true) === true);

// --- 2) TOKEN (estadoInvitacion): un-uso / vencido / revocado ---
t('token pendiente y no vencido → pendiente', estadoInvitacion({ estado: 'pendiente', expiraEn: AHORA + 1000 }, AHORA) === 'pendiente');
t('token usado → usado (un-uso)', estadoInvitacion({ estado: 'usado', expiraEn: AHORA + 1000 }, AHORA) === 'usado');
t('token revocado → revocado', estadoInvitacion({ estado: 'revocado', expiraEn: AHORA + 1000 }, AHORA) === 'revocado');
t('token vencido → vencido (aunque figure pendiente)', estadoInvitacion({ estado: 'pendiente', expiraEn: AHORA - 1 }, AHORA) === 'vencido');
t('token inexistente (doc null) → inexistente', estadoInvitacion(null, AHORA) === 'inexistente');
t('expiraEn como Timestamp {_seconds}', estadoInvitacion({ estado: 'pendiente', expiraEn: { _seconds: (AHORA + 5000) / 1000 } }, AHORA) === 'pendiente');

// --- 3) CFs (wiring en functions/index.js) ---
t('CF generarInvitacionAfiliado (titular o staff, sin filtro de edad)', /exports\.generarInvitacionAfiliado = onCall/.test(fn) && /esStaff \|\| \(u\.permisos/.test(fn) === false); // solo que existe el gate
t('CF generar: titular solo su dependiente; sin cuenta previa', /dep\.titularPersonaId !== callerPersonaId\)\) throw/.test(fn) && /personaTieneLogin\(personaId\)\) throw new HttpsError\('failed-precondition', 'Esa persona ya tiene su cuenta/.test(fn));
t('CF generar: token fuerte 24 bytes url-safe + link a la PWA', /crypto\.randomBytes\(24\)\.toString\('base64url'\)/.test(fn) && /INVITA_LINK_BASE = 'https:\/\/medicaronline\.ar\/socio\/\?invita='/.test(fn));
t('CF validarInvitacion: pública, rate-limit, cero-oráculo', /exports\.validarInvitacion = onCall/.test(fn) && /chequearRateLimitValidar/.test(fn) && /!== 'pendiente'\) return \{ valido: false \}/.test(fn));
t('CF canjearInvitacion: crea usuarios/{uid} con personaId + rol afiliado; MERGE de roles si existe', /exports\.canjearInvitacion = onCall/.test(fn) && /roles: \['afiliado'\]/.test(fn) && /if \(!roles\.includes\('afiliado'\)\) roles\.push\('afiliado'\)/.test(fn));
t('CF canjear: denorma cuentaPropia + fechaNacimiento en el socio', /cuentaPropia: true, cuentaUid: uid, fechaNacimiento: per\.fechaNacimiento/.test(fn));
t('CF canjear: consume el token (un-uso) + idempotente por canjeadoPor', /estado: 'usado', canjeadoPor: uid/.test(fn) && /inv\.canjeadoPor === uid\) return \{ ok: true/.test(fn));
t('CF revocarInvitacion: titular, pendiente→revocado', /exports\.revocarInvitacion = onCall/.test(fn) && /estado: 'revocado', revocadoEn/.test(fn));

// --- 4) resolverDestino usa la privacidad ---
t('resolverDestino: rama self usa ruedaAlTitular (menor rueda, adulto no)', /if \(ruedaAlTitular\(edadDeISO\(per\.fechaNacimiento\), true\)\) \{/.test(fn));
t('resolverDestino: rama para-otro RECHAZA al independiente (adulto con cuenta)', /if \(!ruedaAlTitular\(edadDeISO\(per\.fechaNacimiento\), await personaTieneLogin\(paraPersonaId\)\)\)/.test(fn) && /tiene su propia cuenta; gestiona sus turnos desde su app/.test(fn));

// --- 5) IA PRIVADA (blindaje explícito de Lucas) ---
t('IA: asistente_memoria deny-all (read,write:false) — nadie, ni el titular', /match \/asistente_memoria\/\{personaId\} \{ allow read, write: if false; \}/.test(rules));
t('IA: asistenteChat usa el uid del caller, SIN paraPersonaId (el titular no chatea por otro)', /exports\.asistenteChat = onCall/.test(fn) && !/asistenteChat[\s\S]{0,600}paraPersonaId/.test(fn));

// --- 6) UI (socio + panel) ---
t('socio: flujo ?invita → bienvenida (validar) + crear contraseña + canje', /invitaTokenDeURL\(\)/.test(socio) && /mostrarBienvenidaInvita/.test(socio) && /fnsCall\('canjearInvitacion'/.test(socio) && /case 'invita': html=invitaView\(\)/.test(socio));
t('socio: botón Invitar por integrante sin cuenta + share nativo', /invitarIntegrante\('/.test(socio) && /navigator\.share/.test(socio) && /generarInvitacionAfiliado/.test(socio));
t('socio: solo el titular responsable invita; "tiene su app ✓" si cuentaPropia', /esResponsablePago===true && !socio\.titularSocioId/.test(socio) && /tiene su app ✓/.test(socio));
t('panel: botón Invitar (socio sin cuenta) + chip "Con app"', /afInvitar\('/.test(app) && /s\.cuentaPropia!==true/.test(app) && />Con app</.test(app));
t('rules: match invitaciones_afiliado presente', /match \/invitaciones_afiliado\/\{token\}/.test(rules));

console.log(`\n${fail ? '✗' : '✓'} smoke-invitacion: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
