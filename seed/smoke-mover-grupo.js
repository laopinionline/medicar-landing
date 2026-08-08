'use strict';
/* Smoke — Mover de grupo (UI del Padrón): buscador SOLO titulares (excluye dependientes), 4 pantallas (A form /
   B confirmar grupo / C confirmar independizar / D rechazo titular-con-deps), copy SIN nombres técnicos de campos.
   Extrae las funciones mvg* + helpers del monolito y las corre en un sandbox vm. node seed/smoke-mover-grupo.js */
const vm = require('vm');
const { lines, fns } = require('./lib/extract');
const L = lines('app/index.html');
const src = fns(L, ['esc','normNombre','afPersona','afNombre','afPlanNom','afTitularDe',
  'mvgEsTitularCand','mvgPlanActualId','mvgAbrir','mvgCerrar','mvgSeg','mvgQ','mvgBuscar','mvgPick','mvgVolver','mvgIrConfirm','mvgPanel']);

let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// ── Padrón sintético: 2 titulares (uno con dependiente) + 1 dependiente + 1 dependiente inactivo ──
const personas = [
  { id:'pTit',  apellido:'Peralta', nombre:'Juan',    dni:'20111222' },
  { id:'pDep',  apellido:'Peralta', nombre:'Sofía',   dni:'40333444' },
  { id:'pTit2', apellido:'Molina',  nombre:'Ricardo', dni:'28114502' },
];
const socios = [
  { id:'sTit',  personaId:'pTit',  tipoAfiliado:'directo', activo:true, planId:'planFam' },                                  // titular CON dependiente
  { id:'sDep',  personaId:'pDep',  tipoAfiliado:'directo', activo:true, planId:null, titularSocioId:'sTit', titularPersonaId:'pTit' }, // dependiente
  { id:'sTit2', personaId:'pTit2', tipoAfiliado:'directo', activo:true, planId:'planSen' },                                  // titular destino candidato
  { id:'sDx',   personaId:'pDep',  tipoAfiliado:'directo', activo:false, titularSocioId:'sTit' },                            // dependiente inactivo (ruido)
];
const planes = [ { id:'planFam', nombre:'Plan Familiar' }, { id:'planSen', nombre:'Plan Senior' } ];

function mkSandbox(){
  const sandbox = { console, S:{ user:{rol:'admin',permisos:{gestionar_afiliados:true}}, af:{ socios, personas, planes }, mvg:null }, render(){}, puedeAfil(){ return true; } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { timeout:3000 });
  return sandbox;
}
const socioById = id => socios.find(s => s.id===id);

// ── mvgEsTitularCand: solo titulares activos, excluye dependientes / self ──
(() => { const sb = mkSandbox();
  t('cand: titular activo (sTit2) = true',            sb.mvgEsTitularCand(socioById('sTit2'),'sDep') === true);
  t('cand: dependiente (sDep) = false',               sb.mvgEsTitularCand(socioById('sDep'),'x') === false);
  t('cand: excluye self (sTit2 con excluir sTit2)',   sb.mvgEsTitularCand(socioById('sTit2'),'sTit2') === false);
  t('cand: dependiente inactivo (sDx) = false',       sb.mvgEsTitularCand(socioById('sDx'),'x') === false);
})();

// ── D · rechazo: abrir sobre titular con dependientes ──
(() => { const sb = mkSandbox();
  sb.mvgAbrir('sTit');
  t('D · titular con deps → stage reject',            sb.S.mvg && sb.S.mvg.stage === 'reject');
  const html = sb.mvgPanel(socioById('sTit'));
  t('D · copy "no se mueve el grupo entero de una"',  /no se mueve el grupo entero de una/.test(html));
  t('D · NO expone titularPersonaId/titularSocioId',  !/titularPersonaId|titularSocioId/.test(html));
})();

// ── A · form: abrir sobre dependiente ──
(() => { const sb = mkSandbox();
  sb.mvgAbrir('sDep');
  t('A · dependiente → stage form, modo grupo',       sb.S.mvg && sb.S.mvg.stage === 'form' && sb.S.mvg.modo === 'grupo');
  const html = sb.mvgPanel(socioById('sDep'));
  t('A · segmento "A otro grupo" + "Independizar"',   /A otro grupo/.test(html) && /Independizar/.test(html));
  t('A · buscador de titular destino presente',       /Titular destino \(buscar — solo titulares\)/.test(html));
})();

// ── buscador excluye dependientes (aunque el nombre matchee) ──
(() => { const sb = mkSandbox();
  sb.mvgAbrir('sDep');
  sb.S.mvg.q = 'peralta'; sb.mvgBuscar();               // "Peralta" matchea al titular sTit y al dependiente sDep
  const ids = (sb.S.mvg.hits||[]).map(h=>h.id);
  t('buscar "peralta" → incluye titular sTit',         ids.includes('sTit'));
  t('buscar "peralta" → EXCLUYE dependiente sDep',     !ids.includes('sDep'));
  t('buscar "peralta" → EXCLUYE self (sDep no es cand, ok) y dep inactivo sDx', !ids.includes('sDx'));
  sb.S.mvg.q = 'molina'; sb.mvgBuscar();
  t('buscar "molina" → [sTit2]',                       (sb.S.mvg.hits||[]).length===1 && sb.S.mvg.hits[0].id==='sTit2');
  sb.S.mvg.q = '28114502'; sb.mvgBuscar();
  t('buscar por DNI 28114502 → sTit2',                 (sb.S.mvg.hits||[]).some(h=>h.id==='sTit2'));
})();

// ── B · confirmar cambio de grupo (plan visible Familiar → Senior) ──
(() => { const sb = mkSandbox();
  sb.mvgAbrir('sDep'); sb.mvgPick('sTit2'); sb.mvgIrConfirm();
  t('B · stage confirm',                               sb.S.mvg.stage === 'confirm');
  const html = sb.mvgPanel(socioById('sDep'));
  t('B · "Confirmá el cambio de grupo"',               /Confirmá el cambio de grupo/.test(html));
  t('B · cambio de plan visible (Familiar → Senior)',  /Plan Familiar/.test(html) && /Plan Senior/.test(html) && /→/.test(html));
  t('B · botón "Sí, mover de grupo"',                  /Sí, mover de grupo/.test(html));
  t('B · NO expone nombres técnicos de campos',        !/titularPersonaId|titularSocioId|planId/.test(html));
})();

// ── C · confirmar independizar (plan propio = heredado Familiar) ──
(() => { const sb = mkSandbox();
  sb.mvgAbrir('sDep'); sb.mvgSeg('independizar'); sb.mvgIrConfirm();
  t('C · stage confirm (independizar)',                sb.S.mvg.stage === 'confirm' && sb.S.mvg.modo === 'independizar');
  const html = sb.mvgPanel(socioById('sDep'));
  t('C · "Confirmá independizar del grupo"',           /Confirmá independizar del grupo/.test(html));
  t('C · plan propio = heredado (Plan Familiar)',      /plan propio<\/b> el que venía heredando: <b>Plan Familiar/.test(html));
  t('C · botón "Sí, independizar"',                    /Sí, independizar/.test(html));
  t('C · NO expone nombres técnicos de campos',        !/titularPersonaId|titularSocioId|planId/.test(html));
})();

console.log(`\n${ok}/${ok + fail} checks OK`);
process.exit(fail ? 1 : 0);
