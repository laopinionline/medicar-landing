// Smoke de RENDER (no de sintaxis): ejecuta homeView() real con fixtures de credencial.
// Objetivo: cazar referencias peladas (ReferenceError) en el template — clase de bug F-3.
const vm = require('vm');
const { lines, sym, syms } = require('./lib/extract'); // extracción POR NOMBRE (robusta a mover código; auto función/const)
const L = lines('socio/index.html');

// Funciones REALES que toca la sección (renderizan de verdad):
const esc        = sym(L, 'esc');
const socioMoney = sym(L, 'socioMoney');
const periodoLbl = sym(L, 'periodoLbl');
// helpers reales de la lista de comprobantes (los usa homeView; las sub-partes nuevas —venc/recibo— van stubeadas abajo)
const cuentaHelpers = syms(L, ['facBadge', 'comprobantesOrdenadas', 'comprobanteDetalle', 'comprobanteRow']);
const homeView   = sym(L, 'homeView');

// Stubs de dependencias externas de homeView (browser/otras vistas). Devuelven '' → no importan para el render smoke.
const stubs = `
  const S = __S__;
  const TEL_EMERG = '443044'; // const de módulo real (no es del scope de la sección F-3)
  const IC = { phone:'', share:'' };
  function nombreDe(){return 'X';} function tipoLbl(){return '—';} function esStandalone(){return false;} function esMovil(){return false;}
  function planPrecioTotal(){return 0;} function chv(){return '';} function fmtDni(){return '';}
  function badgeDe(){return '';} function fechaTurno(){return '';} function fromMin(){return '';}
  function toMin(){return 0;} function fstr(){return '';} function pad2(n){return String(n);}
  function abonoEstado(){return 'emitido';} function nombre(){return '';}
  function homeChequeoBlock(){return '';} function homeFeedBlock(){return '';}
  function homeParamsBlock(){return '';} function homeReporteBlock(){return '';}
  function instalar(){} function salir(){} function reservarSlot(){} function cancelarTurnoUI(){}
  function turnoSetPara(){}
  // deps sumadas después de la calibración (turnos/crédito/recibo/vencimiento) → stub a '' para conservar lo que el smoke probaba.
  function waLink(){return '';} function vencLineaSocio(){return '';} function recibosComprobante(){return '';}
  function movimientosCredito(){return '';} function tsMs(){return null;} function medioLabel(){return '';}
  function fmtFechaRecibo(){return '';} function pagosDeFactura(){return [];} function fechaTurnoLbl(){return '';}
  function solicitudesBandejaBlock(){return '';} function misReferentesBlock(){return '';} function seguirFamiliarBlock(){return '';}
  function cargarSolicitudesTitular(){}
`;

const src = `${esc}\n${socioMoney}\n${periodoLbl}\n${cuentaHelpers}\n${stubs}\n${homeView}\n; homeView();`;

const FACT = (o={}) => Object.assign({
  id:'f'+Math.random().toString(36).slice(2,6), periodo:'2099-07',
  nroComprobante:'FC-2026-000001', estado:'emitida', total:15000,
  items:[{descripcion:'Cuota mensual', monto:15000}]
}, o);

const socioBase = { id:'s1', activo:true, numeroAfiliado:'A-100', planId:'p1', tipoAfiliado:'titular' };
const planBase  = { modeloPrecio:'fijo', precio:15000 };

const casos = [
  ['A titular con 2 facturas (emitida+pagada)', { socio:socioBase, plan:planBase, planNombre:'Plan X', per:{}, u:{},
      facturas:[FACT(), FACT({estado:'pagada', nroComprobante:'FC-2026-000002', total:15000})], dependientes:[] }],
  ['B titular SIN facturas (empty-state)',      { socio:socioBase, plan:planBase, planNombre:'Plan X', per:{}, u:{}, facturas:[], dependientes:[] }],
  ['C dependiente (socio con titular, empty)',  { socio:{id:'s2', activo:true, titularSocioId:'s1', tipoAfiliado:'dependiente'}, per:{}, u:{}, facturas:[], dependientes:[] }],
  ['D sin socio (sección no debe renderizar)',  { socio:null, per:{}, u:{}, facturas:[] }],
  ['E 14 facturas (cap-12 + nota + anulada)',   { socio:socioBase, plan:planBase, planNombre:'Plan X', per:{}, u:{},
      facturas:Array.from({length:14},(_,i)=>FACT({nroComprobante:'FC-2026-'+String(i+1).padStart(6,'0'), periodo:'2099-'+String((i%12)+1).padStart(2,'0'), estado:i===0?'anulada':'emitida'})), dependientes:[] }],
  ['F E-3 titular facturarA empresa (nota PWA)', { socio:{...socioBase, facturarA:{tipo:'empresa', razonSocial:'DEMO Convenios SA'}}, plan:planBase, planNombre:'Plan X', per:{}, u:{}, facturas:[], dependientes:[] }],
];

let ok=0, fail=0;
for(const [nombre, cred] of casos){
  try{
    const sandbox = { console, __S__:{ cred, deferredPrompt:null, turnoBusy:false, turnoErr:'', turnoMsg:'', turnoPara:'' } };
    const out = vm.runInNewContext(src, sandbox, { timeout: 3000 });
    const tipo = typeof out;
    const tieneComprob = /Mis comprobantes/.test(out);
    const emptyState = /Todav.a no ten.s comprobantes/.test(out);
    const capNota = /Mostrando los .ltimos 12/.test(out);
    const notaEmp = /Tu facturaci.n se emite a/.test(out);
    if(tipo!=='string') throw new Error('devolvió '+tipo+', no string');
    console.log(`✓ ${nombre} → string(${out.length}) · comprobantes:${tieneComprob} empty:${emptyState} cap12:${capNota} notaEmpresa:${notaEmp}`);
    ok++;
  }catch(e){
    console.log(`✗ ${nombre} → THROW: ${e.name}: ${e.message}`);
    fail++;
  }
}
console.log(`\n${ok}/${ok+fail} render sin throw`);
process.exit(fail?1:0);
