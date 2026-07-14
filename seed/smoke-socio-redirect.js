// Smoke — /socio/ redirect del staff puro (espejo de /app/, sin loop por doble-rol).
// Extrae la clasificación REAL de cargarCredencial (socio/index.html) y verifica la tabla de verdad.
const fs=require('fs'), path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','socio','index.html'),'utf8').split('\n');
const bloque=lines.slice(792,798).join('\n'); // 793-798: roles + STAFF + if(!afiliado){...}

// Envuelvo el bloque en una función: si retorna, es 'staff'/'no-afiliado'; si cae, es 'afiliado' (sigue el flujo normal).
const clasificar=new Function('u', `${bloque}\n return { estado:'afiliado', u };`);

let ok=0, fail=0;
const t=(label,u,exp)=>{ const r=clasificar(u).estado; const c=r===exp; (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${label} → ${r}${c?'':' (esperaba '+exp+')'}`); };

// afiliado se queda
t('afiliado puro (roles)',        {roles:['afiliado']},            'afiliado');
t('afiliado puro (rol legacy)',   {rol:'afiliado'},                'afiliado');
// DOBLE ROL: tiene afiliado → se queda en /socio/ (NO rebota)
t('doble-rol afiliado+medico',    {roles:['afiliado','medico']},   'afiliado');
t('doble-rol medico+afiliado',    {roles:['medico','afiliado']},   'afiliado');
// staff puro → redirect a /app/
t('staff puro medico',            {roles:['medico']},              'staff');
t('staff puro chofer (legacy)',   {rol:'chofer'},                  'staff');
t('staff puro despachante',       {roles:['despachante']},         'staff');
t('staff puro contable',          {roles:['contable']},            'staff');
t('staff puro admin',             {roles:['admin']},               'staff');
t('staff puro superadmin',        {roles:['superadmin']},          'staff');
// sin rol válido → cartel honesto (no redirige → sin loop)
t('sin rol (doc vacío)',          {},                              'no-afiliado');
t('rol desconocido',              {roles:['fantasma']},            'no-afiliado');

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
