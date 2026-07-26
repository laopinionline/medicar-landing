'use strict';
/* Smoke — Manual de marca a código (tramo/marca-tokens): tokens canónicos + semánticos presentes en las TRES
   superficies · tipografía system-stack en app/ (Bebas/DM Sans retirados) · wordmark sin itálica · doc de marca.
   node seed/smoke-marca-tokens.js */
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const landing = R('index.html'), socio = R('socio/index.html'), app = R('app/index.html');
const sw = R('socio/sw.js');
let ok = 0, fail = 0;
const t = (l, c) => { console.log(`${c ? '✓' : '✗ FALLO'} ${l}`); c ? ok++ : fail++; };

// El :root de cada superficie (para chequear DEFINICIÓN, no uso)
const rootOf = (h) => { const m = /:root\s*{([\s\S]*?)}/.exec(h); return m ? m[1] : ''; };
const surfaces = { landing: rootOf(landing), socio: rootOf(socio), app: rootOf(app) };

// ── Tokens de marca (canon Bidondo) definidos en las TRES ──
const CANON = { '--rojo': '#ED1C24', '--rojo-hondo': '#C8151C', '--naranja': '#F7941E', '--tinta': '#1A1A1A', '--gris': '#6B7075', '--linea': '#E7E9EC', '--nieve': '#F7F8FA', '--verde': '#1D9E75', '--ambar': '#E6A100' }; // --verde esmeralda: canónico elegido por Lucas (sobre #2E8B57 del manual)
for (const [tok, hex] of Object.entries(CANON)) {
  for (const [name, root] of Object.entries(surfaces)) {
    t(`${name}: ${tok} = ${hex}`, new RegExp(tok.replace(/[-]/g, '\\-') + ':\\s*' + hex, 'i').test(root));
  }
}

// ── Semánticos NUEVOS definidos en las TRES ──
const SEMANT = { '--verde-hondo': '#1F7A4D', '--verde-nube': '#EAFAF0', '--ambar-hondo': '#B45309', '--ambar-nube': '#FFF8E6', '--peligro': '#E5484D', '--peligro-hondo': '#A11C1C', '--rojo-nube': '#FDECEC' };
for (const [tok, hex] of Object.entries(SEMANT)) {
  for (const [name, root] of Object.entries(surfaces)) {
    t(`${name}: ${tok} = ${hex}`, new RegExp(tok.replace(/[-]/g, '\\-') + ':\\s*' + hex, 'i').test(root));
  }
}

// ── Tokens de superficie en las TRES ──
for (const tok of ['--bg2', '--bg3', '--dark2', '--border2', '--g']) {
  for (const [name, root] of Object.entries(surfaces)) {
    t(`${name}: define ${tok}`, new RegExp(tok.replace(/[-]/g, '\\-') + ':').test(root));
  }
}

// ── app/: --g ahora definido → unifica el verde del panel (antes 27× fallback #1D9E75) ──
t('app: --g:var(--verde) (unifica el verde del panel)', /--g:\s*var\(--verde\)/.test(surfaces.app));

// ── Tipografía: app/ system-stack, sin Bebas/DM Sans ──
t('app: NO carga Google Fonts (link retirado)', !/fonts\.googleapis\.com/.test(app));
t('app: sin font-family Bebas Neue / DM Sans (solo comentario)', (app.match(/font-family:'(Bebas Neue|DM Sans)'/g) || []).length === 0);
t('app: usa system-stack (-apple-system)', /font-family:-apple-system,BlinkMacSystemFont/.test(app));
t('socio: system-stack intacto', /font-family:-apple-system,BlinkMacSystemFont/.test(socio));
t('landing: conserva DM Sans (decisión)', /'DM Sans'/.test(landing) && /fonts\.googleapis\.com/.test(landing));

// ── Wordmark: itálica retirada del wordmark del panel; product/IA reglas ──
t('app: wordmark rolesel-brand SIN itálica', /\.rolesel-brand span\{font-weight:800/.test(app) && !/\.rolesel-brand span\{font-style:italic/.test(app));
t('app: wordmark de producto "medicar" minúscula + chevrón', /rolesel-brand[\s\S]{0,120}<span>medicar<\/span>/.test(app));

// ── Migración: crudos consolidados a tokens (muestras) ──
// El verde del panel se unificó DEFINIENDO --g:var(--verde) → el fallback var(--g,#1D9E75) queda INERTE (nunca se usa).
t('app: fallback #1D9E75 inerte porque --g está definido (verde = var(--verde))', /--g:\s*var\(--verde\)/.test(surfaces.app));
t('app: rojo peligro-hondo tokenizado (sin #a11c1c inline)', !/style="background:#a11c1c/i.test(app) && /var\(--peligro-hondo\)/.test(app));
t('socio: fondos verde/rojo tokenizados (value-preserving)', /var\(--verde-nube\)/.test(socio) && /var\(--rojo-nube\)/.test(socio));

// ── Doc de marca en el repo ──
t('docs/marca.md existe', fs.existsSync(path.resolve(__dirname, '../docs/marca.md')));
const doc = fs.existsSync(path.resolve(__dirname, '../docs/marca.md')) ? R('docs/marca.md') : '';
t('docs/marca.md: referencia al sistema-visual del vault como LEY', /sistema-visual\.html/.test(doc) && /Bidondo/.test(doc));
t('docs/marca.md: nota de capa tematizable del CORE', /capa tematizable del CORE/i.test(doc) && /Triage|MediPaw/.test(doc));
t('docs/marca.md: colores NO tokenizados documentados (triage/chart/escala)', /triage/i.test(doc) && /chart|categ/i.test(doc));

// ── SW bump ──
t('socio SW bumpeado (≥ v48)', /medicar-socio-v(4[8-9]|[5-9]\d)/.test(sw));

console.log(`\n${fail ? '✗' : '✓'} smoke-marca-tokens: ${ok} ok, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
