// Smoke de RENDER (leccion F-3): ejecuta las vistas de Cobranza con fixtures, no solo compila.
// Verifica que cobPanel/cobPorCobrarView/cobFacturaDetalle/cobDeudaView devuelven string sin throw
// y que el saldo derivado (total - Σ pagos registrados no anulados) sale bien.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const lines = html.split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const esc        = slice(1608, 1608);
const facMoney   = slice(3931, 3931);
const facEstBadge= slice(4327, 4327);
const cobranza   = slice(4527, 4721); // bloque C-2/E-3 completo (helpers + vistas + motor)

const stubs = `
  const S = __S__;
  function puedeCobrar(){ return true; }
  function navPush(){} function render(){} function audit(){}
  const FV = () => 1;
  const db = null; // las VISTAS no tocan db; el motor (registrarPago/anular) no se ejecuta en el smoke de render
`;

const src = `${esc}\n${facMoney}\n${facEstBadge}\n${stubs}\n${cobranza}\n`;

const FACTS = [
  { id:'fA', estado:'emitida', nombre:'Ana',  nroComprobante:'FC-2099-000001', total:1000, personaId:'pA', socioId:'sA', numeroAfiliado:'100', periodo:'2099-07' },
  { id:'fB', estado:'emitida', nombre:'Beto', nroComprobante:'FC-2099-000002', total:500,  personaId:'pB', socioId:'sB', numeroAfiliado:'101', periodo:'2099-07' },
  { id:'fC', estado:'pagada',  nombre:'Caro', nroComprobante:'FC-2099-000003', total:800,  personaId:'pC', socioId:'sC', numeroAfiliado:'102', periodo:'2099-07' },
  { id:'fD', estado:'emitida', nombre:'Benitez', nroComprobante:'FC-2099-000004', total:0, personaId:'pD', socioId:'sD', numeroAfiliado:'103', periodo:'2099-07' }, // corporativa pre-exclusión: saldo 0, NO debe aparecer
  // E-3: factura de EMPRESA (cliente polimórfico) con ítem sintético del convenio fijo (sin refId).
  { id:'fE', estado:'emitida', nombre:'DEMO Convenios SA', nroComprobante:'FC-2099-000005', total:80000, periodo:'2099-07', clienteTipo:'empresa', clienteId:'eDemo', clienteNombre:'DEMO Convenios SA', items:[{ tipo:'convenio', descripcion:'Convenio mensual DEMO Convenios SA · 2099-07', monto:80000 }] },
];
const PAGOS = [
  { id:'p1', facturaId:'fA', estado:'registrado', monto:400, fecha:'2099-07-10', medio:'efectivo',      reciboNro:'RC-2099-000001' },
  { id:'p2', facturaId:'fA', estado:'anulado',     monto:200, fecha:'2099-07-09', medio:'transferencia', reciboNro:'RC-2099-000002', motivoAnulacion:'error' },
];

function run(label, cob, fn, checks){
  try{
    const sandbox = { console, __S__:{ cob, user:{uid:'u1'} } };
    const r = vm.runInNewContext(`(function(){\n${src}\n return (${fn})();\n})()`, sandbox, { timeout: 3000 });
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    const extra = checks ? checks(r) : '';
    console.log(`✓ ${label} → string(${r.length}) ${extra}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}

const base = () => ({ sub:'porcobrar', facturas:JSON.parse(JSON.stringify(FACTS)), pagos:JSON.parse(JSON.stringify(PAGOS)), fedit:null, err:'' });

let ok=0, fail=0; const t=(b)=>b?ok++:fail++;
t(run('A panel · por cobrar + tab "Deuda por cliente"', base(), 'cobPanel',
  r => `[emitidas:${(r.match(/lrn/g)||[]).length} · saldoAna:${/\$600/.test(r)} · saldoBeto:${/\$500/.test(r)} · pagadaExcluida:${!/Caro/.test(r)} · tabCliente:${/Deuda por cliente/.test(r)&&!/Deuda por socio/.test(r)}]`));
t(run('B detalle fA · saldo parcial + historial (1 reg + 1 anulado tachado) + form', Object.assign(base(),{fedit:'fA'}), 'cobFacturaDetalle',
  r => `[pagado400:${/Pagado[\s\S]*?\$400/.test(r)} · saldo600:${/\$600/.test(r)} · reciboReg:${/RC-2099-000001/.test(r)} · anuladoTachado:${/line-through[\s\S]*RC-2099-000002|RC-2099-000002[\s\S]*line-through/.test(r)} · form:${/Registrar pago/.test(r)}]`));
t(run('C deuda por socio (Ana 600 + Beto 500 = 1100)', Object.assign(base(),{sub:'deuda'}), 'cobDeudaView',
  r => `[ana:${/Ana[\s\S]*\$600/.test(r)} · beto:${/Beto[\s\S]*\$500/.test(r)} · total1100:${/\$1\.100/.test(r)}]`));
t(run('D empty · sin emitidas (todo al día)', Object.assign(base(),{facturas:[FACTS[2]]}), 'cobPorCobrarView',
  r => `[emptyState:${/al d.a/.test(r)}]`));
t(run('E empty deuda · sin emitidas', Object.assign(base(),{sub:'deuda',facturas:[FACTS[2]]}), 'cobDeudaView',
  r => `[emptyState:${/al d.a/.test(r)}]`));
t(run('F cargando · facturas null', Object.assign(base(),{facturas:null}), 'cobPorCobrarView',
  r => `[cargando:${/Cargando/.test(r)}]`));
// Bug 2 — filtro saldo>0: la emitida total 0 (Benitez) NO aparece ni suma al total.
t(run('G filtro · emitida saldo 0 (Benitez) excluida', base(), 'cobPorCobrarView',
  r => `[benitezOculto:${!/Benitez/.test(r)} · total1100:${/\$1\.100/.test(r)} · sigue2:${(r.match(/lrn/g)||[]).length===2}]`));
// Bug 1 — post-registro: tras la inserción optimista, el detalle muestra el pago nuevo y el saldo baja.
t(run('H post-registro · detalle fB refleja el pago recién insertado', (() => {
    const cob = Object.assign(base(), { fedit:'fB' });
    cob.pagos.push({ id:'pNew', facturaId:'fB', estado:'registrado', monto:200, fecha:'2099-07-12', medio:'transferencia', reciboNro:'RC-2099-000003' });
    return cob;
  })(), 'cobFacturaDetalle',
  r => `[reciboNuevo:${/RC-2099-000003/.test(r)} · pagado200:${/Pagado[\s\S]*?\$200/.test(r)} · saldo300:${/\$300/.test(r)}]`));

// E-3 — factura de empresa: aparece en Por cobrar (por nombre = razón social), detalle con ítem sintético, deuda por cliente.
t(run('I E-3 por cobrar · factura EMPRESA muestra "EMPRESA" (no "particular")', base(), 'cobPorCobrarView',
  r => `[demo:${/DEMO Convenios SA/.test(r)} · saldo80000:${/\$80\.000/.test(r)} · empresaLbl:${/EMPRESA/.test(r)} · sinParticular:${!/particular/.test(r)}]`));
t(run('J E-3 detalle factura EMPRESA renderiza sin throw (scope: no depende de S.fac)', Object.assign(base(),{fedit:'fE'}), 'cobFacturaDetalle',
  r => `[header:${/DEMO Convenios SA/.test(r)} · total80000:${/\$80\.000/.test(r)} · empresaLbl:${/Empresa/.test(r)}]`));
t(run('K E-3 deuda por CLIENTE · empresa con badge EMPRESA', Object.assign(base(),{sub:'deuda'}), 'cobDeudaView',
  r => `[empresaBadge:${/DEMO Convenios SA[\s\S]*EMPRESA/.test(r)} · cliente:${/cliente/.test(r)}]`));

console.log(`\n${ok}/${ok+fail} vistas render sin throw`);
process.exit(fail?1:0);
