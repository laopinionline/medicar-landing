// Smoke — WhatsApp institucional de atención (videollamada de turnos): la tarjeta arma el wa.me correcto; sin número, sin botón.
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.join(__dirname,'..');
const socio=fs.readFileSync(path.join(root,'socio','index.html'),'utf8');
let ok=0, fail=0; const t=(l,c,x)=>{ (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l}${x?' → '+x:''}`); };

// waLink: normaliza a wa.me/549<numero>
const line=socio.split('\n').find(l=>/^function waLink\(/.test(l));
const sb={}; vm.runInNewContext(`${line}\n this.f=waLink;`, sb, {timeout:2000}); const f=sb.f;
t('waLink("") = "" (sin número → sin link)', f('')==='', JSON.stringify(f('')));
t('waLink("2477123456") → wa.me/5492477123456', f('2477123456')==='https://wa.me/5492477123456');
t('waLink con 549 ya puesto no duplica', f('549 2477 123456')==='https://wa.me/5492477123456');
t('waLink con 54 y formato feo', f('+54 9 2477-12-3456')==='https://wa.me/5492477123456', f('+54 9 2477-12-3456'));
t('waLink(null) = ""', f(null)==='');

// la tarjeta del turno: botón condicionado a que haya número (nunca link roto)
t('tarjeta: botón "Iniciar videollamada" condicionado a wa (${wa?...})', /\$\{wa\?`<a href="\$\{wa\}"[^`]*Iniciar videollamada<\/a>`:''\}/.test(socio));
t('el link usa el wa.me construido (href=${wa})', /href="\$\{wa\}"/.test(socio));
t('la sección aclara que la videollamada es por WhatsApp', /videollamada se realiza por WhatsApp/.test(socio));
t('el socio lee configuracion/club para el número', /collection\('configuracion'\)\.doc\('club'\)\.get\(\)/.test(socio) && /waAtencion/.test(socio));

// la regla de configuracion existe (read autenticado, write configurar_sistema)
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
t('regla configuracion: read isSignedIn, write configurar_sistema', /match \/configuracion\/\{id\} \{[\s\S]*allow read:  if isSignedIn\(\);[\s\S]*allow write: if tienePermiso\('configurar_sistema'\);/.test(rules));

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
