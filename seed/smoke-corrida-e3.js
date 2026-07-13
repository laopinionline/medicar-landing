// Smoke de la CORRIDA E-3 (modelo fiel de la lógica de generarAbonos/generarFacturas, sin DB).
// Fixture: titulardemo (directo, facturarA→DEMO Convenios SA fijo $80.000) · persona1 (directo, persona) ·
// corp1 (corporativo SIN facturarA). Verifica: skip fijo en abonos, RED corp, agrupador por destinatario,
// ítem sintético del convenio fijo, factura de empresa sin personaId, contadores de reporte.

const socios = {
  titulardemo: { id:'titulardemo', tipoAfiliado:'directo', activo:true, planId:'pl1', personaId:'pTit', numeroAfiliado:'900', facturarA:{ tipo:'empresa', empresaId:'eDemo', razonSocial:'DEMO Convenios SA' } },
  persona1:    { id:'persona1',    tipoAfiliado:'directo', activo:true, planId:'pl1', personaId:'pP1', numeroAfiliado:'901' },
  corp1:       { id:'corp1',       tipoAfiliado:'corporativo', activo:true, planId:'pl1', personaId:'pC1', numeroAfiliado:'30500', empresaId:'eMet' },
};
const empresas = {
  eDemo: { id:'eDemo', activo:true, razonSocial:'DEMO Convenios SA', numeroConvenio:'30703', convenio:{ modo:'fijo', montoMensual:80000 } },
  eMet:  { id:'eMet',  activo:true, razonSocial:'Metalúrgica',        numeroConvenio:'30704' }, // convenio sin cargar
};
const PER = '2099-09';

// ---- generarAbonos (modelo): quién genera abono ----
function corridaAbonos(){
  const rep={ generados:0, destFijo:0, corpSinDest:0 }; const abonos=[];
  for(const s of Object.values(socios)){
    const fa=s.facturarA;
    if(fa && fa.tipo==='empresa'){ const emp=empresas[fa.empresaId]; if(emp && emp.convenio && emp.convenio.modo==='fijo'){ rep.destFijo++; continue; } }
    else if(s.tipoAfiliado==='corporativo'){ rep.corpSinDest++; continue; }
    abonos.push({ id:'ab-'+s.id, socioId:s.id, personaId:s.personaId, socioNombre:s.id, numeroAfiliado:s.numeroAfiliado, planNombre:'Plan 1', periodo:PER, precioFinal:15000, estado:'generado' });
    rep.generados++;
  }
  return { rep, abonos };
}

// ---- generarFacturas (modelo): agrupador por destinatario + pasada de fijos ----
function corridaFacturas(abonos, cargos){
  const destinoDe=(socioId)=>{ const s=socios[socioId]; const fa=s&&s.facturarA;
    if(fa && fa.tipo==='empresa'){ const emp=empresas[fa.empresaId]; return { key:'e:'+fa.empresaId, tipo:'empresa', empresaId:fa.empresaId, razonSocial:fa.razonSocial||(emp&&emp.razonSocial)||'' }; }
    if(s && s.tipoAfiliado==='corporativo') return null;
    return { key:'p:'+(s?s.personaId:''), tipo:'persona' }; };
  const grupos={}; const corpExcl=new Set();
  const push=(dest,base,item)=>{ const g=grupos[dest.key]||(grupos[dest.key]=Object.assign({items:[]},base)); g.items.push(item); };
  abonos.forEach(a=>{ if(a.estado!=='generado'||a.facturaId) return; const dest=destinoDe(a.socioId); if(!dest){ corpExcl.add(a.socioId); return; }
    if(dest.tipo==='persona' && !a.personaId) return;
    const item={ tipo:'abono', refId:a.id, monto:a.precioFinal, descripcion:'Abono '+a.planNombre };
    if(dest.tipo==='empresa') push(dest,{clienteTipo:'empresa',clienteId:dest.empresaId,nombre:dest.razonSocial,clienteNombre:dest.razonSocial},item);
    else push(dest,{personaId:a.personaId,socioId:a.socioId,nombre:a.socioNombre,numeroAfiliado:a.numeroAfiliado},item); });
  (cargos||[]).forEach(c=>{ if(c.estado!=='generado'||c.facturaId) return; const dest=destinoDe(c.socioId); if(!dest){ corpExcl.add(c.socioId); return; }
    const item={ tipo:'cargo', refId:c.id, monto:c.precioFinal, descripcion:'Cargo' };
    if(dest.tipo==='empresa') push(dest,{clienteTipo:'empresa',clienteId:dest.empresaId,nombre:dest.razonSocial,clienteNombre:dest.razonSocial},item);
    else push(dest,{personaId:c.personaId,socioId:c.socioId,nombre:'x',numeroAfiliado:null},item); });
  // pasada de convenios fijos
  const empresasYaFacturadas=new Set();
  Object.values(empresas).forEach(emp=>{ if(emp.activo===false||!(emp.convenio&&emp.convenio.modo==='fijo')||empresasYaFacturadas.has(emp.id)) return;
    const tiene=Object.values(socios).some(s=>s.activo!==false && s.facturarA && s.facturarA.tipo==='empresa' && s.facturarA.empresaId===emp.id); if(!tiene) return;
    push({key:'e:'+emp.id},{clienteTipo:'empresa',clienteId:emp.id,nombre:emp.razonSocial,clienteNombre:emp.razonSocial},{ tipo:'convenio', descripcion:'Convenio mensual '+emp.razonSocial+' · '+PER, monto:emp.convenio.montoMensual }); });
  // construir facturas (shape polimórfico)
  const facturas=Object.keys(grupos).map(key=>{ const g=grupos[key]; const total=g.items.reduce((s,it)=>s+it.monto,0);
    return g.clienteTipo==='empresa'
      ? { periodo:PER, nombre:g.nombre, items:g.items, total, estado:'emitida', nroComprobante:'FC-2099-000001', clienteTipo:'empresa', clienteId:g.clienteId, clienteNombre:g.clienteNombre }
      : { periodo:PER, personaId:g.personaId, socioId:g.socioId, nombre:g.nombre, numeroAfiliado:g.numeroAfiliado, items:g.items, total, estado:'emitida', nroComprobante:'FC-2099-000002' }; });
  return { facturas, corpExcl };
}

let ok=0, fail=0; const chk=(label,cond,extra)=>{ (cond?ok++:fail++); console.log(`${cond?'✓':'✗'} ${label}${extra?' '+extra:''}`); };

const { rep, abonos } = corridaAbonos();
chk('generarAbonos: solo persona1 genera abono', rep.generados===1 && abonos.length===1 && abonos[0].socioId==='persona1', `[gen:${rep.generados} fijo:${rep.destFijo} corpSinDest:${rep.corpSinDest}]`);
chk('generarAbonos: titulardemo fijo → sin abono (destFijo=1)', rep.destFijo===1);
chk('generarAbonos: corp1 sin facturarA → RED (corpSinDest=1)', rep.corpSinDest===1);

const corpCargo=[{ id:'cg-corp1', socioId:'corp1', personaId:'pC1', precioFinal:5000, estado:'generado' }];
const { facturas, corpExcl } = corridaFacturas(abonos, corpCargo);
const facEmp=facturas.find(f=>f.clienteTipo==='empresa');
const facPer=facturas.find(f=>f.clienteTipo!=='empresa');
chk('genera 2 facturas (persona1 + DEMO Convenios SA)', facturas.length===2, `[${facturas.map(f=>f.clienteTipo==='empresa'?('emp:'+f.total):('per:'+f.total)).join(' ')}]`);
chk('factura EMPRESA: clienteTipo/clienteId/clienteNombre, SIN personaId', !!facEmp && facEmp.clienteId==='eDemo' && facEmp.clienteNombre==='DEMO Convenios SA' && !('personaId' in facEmp));
chk('factura EMPRESA: ítem sintético del convenio (sin refId) $80.000', !!facEmp && facEmp.items.length===1 && facEmp.items[0].tipo==='convenio' && !('refId' in facEmp.items[0]) && facEmp.total===80000);
chk('factura PERSONA: persona1 con su abono, con personaId', !!facPer && facPer.personaId==='pP1' && facPer.total===15000 && facPer.items[0].refId==='ab-persona1');
chk('corp1 (cargo) excluido de facturación (RED)', corpExcl.has('corp1') && !facturas.some(f=>f.items.some(it=>it.refId==='cg-corp1')));

// ---- Render del COMPROBANTE de la factura de empresa (membrete N° convenio + ítem sintético) ----
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const lines = fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8').split('\n');
const sl = (a,b)=>lines.slice(a-1,b).join('\n');
const srcC = `${sl(1608,1608)}\n${sl(3931,3931)}\n${sl(4327,4327)}\nconst S=__S__;\n${sl(4467,4498)}\n`;
try{
  const facEmpFix = { id:'fE', clienteTipo:'empresa', clienteId:'eDemo', clienteNombre:'DEMO Convenios SA', nombre:'DEMO Convenios SA', periodo:'2099-09', total:80000, estado:'emitida', nroComprobante:'FC-2099-000009', items:[{ tipo:'convenio', descripcion:'Convenio mensual DEMO Convenios SA · 2099-09', monto:80000 }] };
  const sandbox = { console, __S__:{ fac:{ comprobante:'fE', facturas:[facEmpFix], empresas:[{ id:'eDemo', numeroConvenio:'30703' }] } } };
  const r = vm.runInNewContext(`(function(){\n${srcC}\n return facComprobante();\n})()`, sandbox, { timeout:3000 });
  const membrete = /Convenio N° 30703/.test(r);
  const razon = /DEMO Convenios SA/.test(r);
  const itemSint = /Convenio mensual DEMO Convenios SA · 2099-09/.test(r);
  const monto = /\$80\.000/.test(r);
  chk('comprobante EMPRESA: membrete N° convenio + razón social + ítem sintético + monto', membrete && razon && itemSint && monto, `[N°conv:${membrete} razón:${razon} ítemSint:${itemSint} $80k:${monto}]`);
}catch(e){ chk('comprobante EMPRESA render', false, '→ THROW '+e.message); }

console.log(`\n${ok}/${ok+fail} checks de corrida E-3`);
process.exit(fail?1:0);
