// Smoke de RENDER — Vista de cuenta del socio (bloque único de comprobantes).
const fs=require('fs'); const vm=require('vm'); const path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','socio','index.html'),'utf8').split('\n');
const sl=(a,b)=>lines.slice(a-1,b).join('\n');
const esc=sl(573,573), socioMoney=sl(648,648), periodoLbl=sl(657,661), chv=sl(925,925), cuenta=sl(664,705), homeView=sl(974,1155);

const stubs=`
  const S=__S__;
  const TEL_EMERG='443044'; const IC={phone:'',share:''};
  function nombreDe(){return 'X';} function tipoLbl(){return '—';} function esStandalone(){return false;} function esMovil(){return false;}
  function planPrecioTotal(){return 0;} function fmtDni(){return '';} function fechaTurno(){return '';} function fromMin(){return '';}
  function toMin(){return 0;} function fstr(){return '';} function pad2(n){return String(n);}
  function homeChequeoBlock(){return '';} function homeFeedBlock(){return '';} function homeParamsBlock(){return '';} function homeReporteBlock(){return '';}
  function instalar(){} function salir(){} function reservarSlot(){} function cancelarTurnoUI(){} function turnoSetPara(){} function abrirComprobantes(){} function navBack(){}
`;
const src=`${esc}\n${socioMoney}\n${periodoLbl}\n${chv}\n${stubs}\n${cuenta}\n${homeView}\n`;

const FACT=(o={})=>Object.assign({nroComprobante:'FC-2026-000010', periodo:'2099-08', total:18000, estado:'emitida', items:[{tipo:'abono',descripcion:'Abono Plan 01 2099-08',monto:18000}]},o);
const socioBase={id:'s1', activo:true, numeroAfiliado:'A-100', planId:'p1', tipoAfiliado:'titular'};
const planBase={modeloPrecio:'fijo', precio:18000};

function run(label, fn, cred, checks){
  try{
    const sandbox={console, __S__:{cred, view:'home', turnoBusy:false, turnoErr:'', turnoMsg:'', turnoPara:'', deferredPrompt:null}};
    const r=vm.runInNewContext(`(function(){\n${src}\n return (${fn});\n})()`, sandbox, {timeout:3000});
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    console.log(`✓ ${label} → string(${r.length}) ${checks?checks(r):''}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok=0, fail=0; const t=b=>b?ok++:fail++;

// --- helpers ---
t(run('A facBadge: emitida→FACTURADO, pagada→PAGADO, anulada→ANULADA', `facBadge('emitida')+'|'+facBadge('pagada')+'|'+facBadge('anulada')`, {},
  r=>`[FACTURADO:${/FACTURADO/.test(r)} PAGADO:${/PAGADO/.test(r)} ANULADA:${/ANULADA/.test(r)} sinEmitido:${!/EMITID/.test(r)}]`));
t(run('B detalle SIN cargos → "Otras prestaciones" oculta, TOTAL', `comprobanteDetalle(${JSON.stringify(FACT())})`, {},
  r=>`[abono:${/Abono/.test(r)} sinOtras:${!/Otras prestaciones/.test(r)} total:${/TOTAL/.test(r)} monto:${/\$18\.000/.test(r)}]`));
t(run('C detalle CON cargo → "Otras prestaciones" presente', `comprobanteDetalle(${JSON.stringify(FACT({total:23000, items:[{tipo:'abono',descripcion:'Abono',monto:18000},{tipo:'cargo',descripcion:'Traslado INC-5',monto:5000}]}))})`, {},
  r=>`[abono:${/Abono/.test(r)} otras:${/Otras prestaciones/.test(r)} traslado:${/Traslado/.test(r)} total23:${/\$23\.000/.test(r)}]`));

// --- homeView: bloque de cuenta ---
t(run('D titular 2 facturas → "Mi cuenta", última + Ver historial', 'homeView()', {socio:socioBase, plan:planBase, planNombre:'P', per:{}, u:{}, dependientes:[], facturas:[FACT({estado:'pagada',nroComprobante:'FC-2026-000011',periodo:'2099-09'}), FACT()]},
  r=>`[miCuenta:${/Mi cuenta/.test(r)} verHist:${/abrirComprobantes/.test(r)&&/Ver historial \(2\)/.test(r)} ultimaPagado:${/FC-2026-000011[\s\S]*PAGADO/.test(r)} sinHistorialCuotas:${!/Historial de cuotas/.test(r)}]`));
t(run('E titular 1 factura → sin "Ver historial"', 'homeView()', {socio:socioBase, plan:planBase, planNombre:'P', per:{}, u:{}, dependientes:[], facturas:[FACT()]},
  r=>`[miCuenta:${/Mi cuenta/.test(r)} sinVerHist:${!/Ver historial/.test(r)} facturado:${/FACTURADO/.test(r)}]`));
t(run('F dependiente → nota "gestiona el titular"', 'homeView()', {socio:{id:'s2',activo:true,titularSocioId:'s1',tipoAfiliado:'directo'}, per:{}, u:{}, dependientes:[], facturas:[]},
  r=>`[nota:${/gestiona el titular/.test(r)} sinComprobantes:${!/Ver historial/.test(r)}]`));
t(run('G titular sin facturas → empty-state', 'homeView()', {socio:socioBase, plan:planBase, planNombre:'P', per:{}, u:{}, dependientes:[], facturas:[]},
  r=>`[empty:${/Todavía no tenés comprobantes/.test(r)}]`));

// --- vista apilada del historial ---
t(run('H comprobantesFullView → lista todas + topbar', 'comprobantesFullView()', {facturas:[FACT(), FACT({nroComprobante:'FC-2026-000011',estado:'pagada'})]},
  r=>`[topbar:${/Mis comprobantes/.test(r)} dos:${(r.match(/<details/g)||[]).length===2} volver:${/navBack/.test(r)}]`));

console.log(`\n${ok}/${ok+fail} render de la cuenta sin throw`);
process.exit(fail?1:0);
