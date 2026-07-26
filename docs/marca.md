# Marca MEDICAR — manual a código

**Fuente canónica (LEY):** `PERGA-STUDIO-BRAIN/04-PROYECTOS/MEDICAR/Diseno/sistema-visual.html` + `MARCA-assets.svg.txt` (vault Obsidian). Es el manual de Bidondo retocado por Lucas — de ahí salen el chevrón, las tres líneas de velocidad, el rojo y el naranja histórico. Este archivo baja esa ley al código.

Los tokens viven en el `:root` de las **tres superficies** (`index.html` landing · `socio/index.html` PWA · `app/index.html` panel), idénticos. **Son la capa tematizable del CORE**: Triage / MediPaw heredan la ESTRUCTURA (nombres de token, componentes) y cambian los VALORES.

## Paleta (tokens)

### Marca (canon Bidondo)
| Token | Hex | Rol |
|---|---|---|
| `--rojo` | `#ED1C24` | acento primario / marca |
| `--rojo-hondo` | `#C8151C` | hover / presionado |
| `--naranja` | `#F7941E` | segundo acento (guiño histórico, chevrón interior) |
| `--tinta` | `#1A1A1A` | texto principal / negro credencial |
| `--gris` | `#6B7075` | texto secundario |
| `--ink3` | `#9AA0A6` | texto terciario |
| `--linea` | `#E7E9EC` | divisores / bordes suaves |
| `--nieve` | `#F7F8FA` | fondo de módulos |
| `--blanco` | `#FFFFFF` | — |

### Semáforo salud / estados (derivados temáticos)
| Token | Hex | Rol |
|---|---|---|
| `--verde` | `#1D9E75` | OK / salud — **un solo verde manda** (esmeralda de-facto del panel, elegido canónico por Lucas sobre el #2E8B57 del manual) |
| `--verde-hondo` | `#1F7A4D` | verde texto-oscuro / badge |
| `--verde-nube` | `#EAFAF0` | verde fondo-claro |
| `--ambar` | `#E6A100` | atención |
| `--ambar-hondo` | `#B45309` | ámbar texto-oscuro |
| `--ambar-nube` | `#FFF8E6` | ámbar fondo-claro |
| `--peligro` | `#E5484D` | rojo de error/peligro (distinto del rojo de MARCA) |
| `--peligro-hondo` | `#A11C1C` | peligro texto-oscuro / badge |
| `--rojo-nube` | `#FDECEC` | rojo fondo-claro |

### Superficie
`--bg2 #EDEFF2` · `--bg3 #E2E5E9` · `--dark2 #232527` · `--border2 #D6DADF` — presentes en las tres superficies.

### Forma
`--radio: 16px` · `--sombra` / `--sombra-alta` (definidas en el `:root`).

## Tipografía
**System-stack** en socio/ y app/ (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) — así lo prescribe el sistema-visual. La **landing** mantiene **DM Sans** (Google) por decisión. Bebas Neue + DM Sans **retirados del panel** (tramo/marca-tokens).

## Wordmark e isotipo
- **Isotipo**: chevrón de Bidondo (`#cm` bicolor `#F7941E`+`#ED1C24` · `#cmono` mono) + helper `chv()`. Presente en las tres superficies.
- **"medicar" minúscula + chevrón** = wordmark de PRODUCTO (credencial, apps).
- **"MED·I·C·A·R"** con I/A en naranja `#F7941E` = **exclusivo del header del chat IA**.
- **Itálica bold** del wordmark: **retirada** de superficies digitales (headings decorativos en itálica no son wordmark y quedan como están).

## Colores intencionalmente NO tokenizados (dejados a propósito)
Para no romper semántica de datos, quedan crudos (documentados, futura pasada si se decide):
- **Semáforo clínico de triage** (arrays JS `['rojo','Emergencia','#E5484D']`, `['amarillo','Urgencia','#E0A23B']`, `['verde','Atención','#1D9E75']`): colores máximamente distinguibles por seguridad clínica.
- **Paleta categórica de charts** (`['#DC1400','#1D9E75','#2D6CDF','#E08600','#7A3FB8','#0F8A8A','#C2185B','#4A7A1A']`): cualitativa, cada hue = una categoría.
- **Escalas continuas / gauges** (umbrales tipo `sc<28?'#E5484D':'#E0A23B'`): rampas, no tokens.
- **Hues distintos** (azules info/links, violetas del referente, rosas): identidad propia, fuera de la familia verde/rojo/ámbar.
