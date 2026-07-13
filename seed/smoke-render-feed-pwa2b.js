// Smoke de RENDER (PWA-2b): ejecuta homeFeedBlock() con fixtures de feed_posts (los 4 cat + vacío).
const fs=require('fs'); const vm=require('vm'); const path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..','socio','index.html'),'utf8').split('\n');
const sl=(a,b)=>lines.slice(a-1,b).join('\n');
const esc=sl(573,573); const feedBlock=sl(1158,1199);
const stubs=`const S=__S__; function render(){} const db=null;`;
const src=`${esc}\n${stubs}\n${feedBlock}\n`;

function run(label, feed, checks){
  try{
    const sandbox={ console, __S__:{ feed } };
    const r=vm.runInNewContext(`(function(){\n${src}\n return homeFeedBlock();\n})()`, sandbox, {timeout:3000});
    if(typeof r!=='string') throw new Error('devolvió '+typeof r);
    console.log(`✓ ${label} → string(${r.length}) ${checks?checks(r):''}`);
    return true;
  }catch(e){ console.log(`✗ ${label} → THROW: ${e.name}: ${e.message}`); return false; }
}
let ok=0, fail=0; const t=b=>b?ok++:fail++;

const CUATRO=[
  { cat:'medicar', origen:'interno',   titulo:'Sumamos un móvil', bajada:'Más cobertura.', fuenteNombre:'MEDICAR', link:null },
  { cat:'salud',   origen:'externo',   titulo:'Presión arterial', bajada:'Cómo medirla.', fuenteNombre:'OPS', link:'https://paho.org/x' },
  { cat:'nutri',   origen:'laopinion', titulo:'El plato saludable', bajada:'Mitad verduras.', fuenteNombre:'La Opinión', link:'https://laopinionline.ar/x' },
  { cat:'vida',    origen:'laopinion', titulo:'Tendencias de bienestar', bajada:'Hábitos.', fuenteNombre:'La Opinión', link:'https://laopinionline.ar/y' },
];

t(run('A los 4 cat (medicar/salud/nutri/vida) + meta=fuenteNombre', CUATRO, r=>{
  const arts=(r.match(/<article/g)||[]).length;
  const tags=['MEDICAR','Cuidado','Alimentación','Vida'].every(x=>r.includes(x));
  const tagVida=/tag-vida/.test(r);
  const metaFuente=r.includes('>OPS<') && r.includes('>La Opinión<');
  return `[articulos:${arts} · tags4:${tags} · tagVida:${tagVida} · metaFuente:${metaFuente}]`;
}));
t(run('B interno NO tappable / laopinion-externo SÍ', CUATRO, r=>{
  // 3 tappable (salud externo + 2 laopinion), interno sin onclick
  const tappables=(r.match(/class="post tappable"/g)||[]).length;
  const onclicks=(r.match(/onclick="feedAbrir\(/g)||[]).length;
  const internoPlano=/class="post">/.test(r); // interno = class post SIN tappable ni onclick
  return `[tappables3:${tappables===3} · onclicks3:${onclicks===3} · internoPlano:${internoPlano}]`;
}));
t(run('C vacío → sección OCULTA (string vacío)', [], r=>`[oculto:${r===''}]`));
t(run('D un solo interno → no tappable', [CUATRO[0]], r=>`[unArticulo:${(r.match(/<article/g)||[]).length===1} · sinOnclick:${!/onclick/.test(r)} · sinTappable:${!/tappable/.test(r)}]`));

// PWA-2c — foto en la tarjeta: con imagenUrl → url(...); sin imagenUrl → banda de color.
t(run('E CON foto (imagenUrl) → background url()', [{ cat:'salud', origen:'laopinion', titulo:'Con foto', bajada:'x', fuenteNombre:'La Opinión', link:'https://x', imagenUrl:'https://firebasestorage.googleapis.com/v0/b/x/o/feed%2Fabc%2Fimg.jpg?alt=media' }],
  r=>`[url:${/background-image:url\('https:\/\/firebasestorage/.test(r)} · sinBanda:${!/linear-gradient/.test(r)}]`));
t(run('F SIN foto → banda de color (gradient)', [{ cat:'nutri', origen:'externo', titulo:'Sin foto', bajada:'x', fuenteNombre:'OPS', link:'https://x' }],
  r=>`[banda:${/background-image:linear-gradient/.test(r)} · sinUrl:${!/url\(/.test(r)}]`));
t(run('G interno SIN link → NO tappable (tarjeta = mensaje)', [{ cat:'medicar', origen:'interno', titulo:'Móvil nuevo', bajada:'La foto es la noticia.', fuenteNombre:'MEDICAR', link:null, imagenUrl:'https://firebasestorage.googleapis.com/v0/b/x/o/feed%2Fint%2Fimg.jpg?alt=media' }],
  r=>`[foto:${/url\('https:\/\/firebasestorage/.test(r)} · noTappable:${!/tappable/.test(r)&&!/onclick/.test(r)}]`));
t(run('H interno CON link → SÍ tappable (abre la nota)', [{ cat:'medicar', origen:'interno', titulo:'Móvil nuevo', bajada:'Con nota detrás.', fuenteNombre:'MEDICAR', link:'https://laopinionline.ar/nota' }],
  r=>`[tappable:${/class="post tappable"/.test(r)} · onclick:${/onclick="feedAbrir\(0\)"/.test(r)}]`));

console.log(`\n${ok}/${ok+fail} render de homeFeedBlock sin throw`);
process.exit(fail?1:0);
