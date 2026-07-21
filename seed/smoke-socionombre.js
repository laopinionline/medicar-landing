// Smoke — socioNombreDe(): no duplica el apellido cuando `nombre` ya lo trae (bug "Torres, Lucía Torres").
const vm=require('vm');
const { lines, fn }=require('./lib/extract'); // extracción POR NOMBRE
const src=fn(lines('app/index.html'), 'socioNombreDe');
const sandbox={}; vm.runInNewContext(`${src}\n globalThis.__f__=socioNombreDe;`, sandbox, {timeout:3000});
const f=sandbox.__f__;
let ok=0, fail=0; const t=(l,got,exp)=>{ const c=got===exp; (c?ok++:fail++); console.log(`${c?'✓':'✗'} ${l} → "${got}"${c?'':' (esperaba "'+exp+'")'}`); };

// el bug reportado
t('nombre incluye apellido al final (Torres)', f({apellido:'Torres', nombre:'Lucía Torres'}), 'Torres, Lucía');
t('nombre incluye apellido al final (Díaz)',   f({apellido:'Díaz', nombre:'Roberto Díaz'}),  'Díaz, Roberto');
// casos limpios (no debe cambiar)
t('nombre solo de pila (caso normal)',         f({apellido:'Gómez', nombre:'Ana'}),          'Gómez, Ana');
t('apellido compuesto ya incluido',            f({apellido:'De la Cruz', nombre:'Juan De la Cruz'}), 'De la Cruz, Juan');
t('sin apellido (nombre completo suelto)',     f({apellido:'', nombre:'Lucía Torres'}),      'Lucía Torres');
t('solo dni (sin nombre)',                     f({dni:'30111222'}),                          '30111222');
t('nombre == apellido (no deja "Torres, Torres")', f({apellido:'Torres', nombre:'Torres'}), 'Torres');
t('case-insensitive (torres/Torres)',          f({apellido:'Torres', nombre:'Lucía torres'}), 'Torres, Lucía');

console.log(`\n${ok}/${ok+fail} checks OK`);
process.exit(fail?1:0);
