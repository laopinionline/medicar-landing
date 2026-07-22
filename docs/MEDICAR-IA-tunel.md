# MEDICAR IA — cómo levantar / apagar el túnel (prototipo Ollama)

La CF `asistenteChat` corre en Google Cloud y NO alcanza el `localhost` de Lucas.
Para el prototipo, un túnel expone el Ollama de la máquina de Lucas a la CF.
En producción esto NO se usa: se cambia el proveedor a `claude` (API real) y **nunca** se expone Ollama.

## Requisitos en la máquina de Lucas
- Ollama corriendo con el modelo: `ollama serve` (y `ollama list` debe mostrar `llama3.1:8b`).
  - No hace falta `OLLAMA_ORIGINS`: la CF llama **server-to-server** (no hay CORS de navegador).
- `cloudflared` instalado: `brew install cloudflared`.

## Levantar el túnel (demo rápida)
```
cloudflared tunnel --url http://localhost:11434
```
Imprime una URL `https://<algo>.trycloudflare.com`. **Esa URL es la que va en la config** (abajo).
- Es efímera: cambia cada vez que se levanta. Al reconfigurar, actualizar la config.
- ⚠️ Es pública aunque obscura: cualquiera con la URL llega a Ollama mientras el túnel está arriba.
  Para una demo corta alcanza; **apagala al terminar** (Ctrl-C). Para algo más que una demo, ver "Hardening".

## Apagar
- `Ctrl-C` en la terminal del `cloudflared`. Con eso la CF deja de alcanzar el modelo y **la app degrada limpio**
  (mensaje "ahora no puedo responder, llamá al 443044", el botón médico sigue). No se rompe nada.

## Configurar la CF para que use el túnel
La config sensible vive en `asistente_secreto/config` (Firestore, **read/write:false** → solo Admin SDK; ningún
socio ni staff la lee desde el cliente). Se setea con el seed:
```
node seed/set-asistente-config.js ollama "https://<algo>.trycloudflare.com" "<token-opcional>"
```
Y el flag público que enciende la sección en la PWA:
- `configuracion/asistente = { habilitado: true }` (lo setea el mismo seed).

Para volver a producción (cuando exista la rama `claude`):
```
node seed/set-asistente-config.js claude "" "" <claude-api-key>
```

## Hardening (más que una demo)
El `token` de la config se manda como `Authorization: Bearer` desde la CF, pero **Ollama no lo valida solo**.
Para que el token proteja de verdad:
- **Named tunnel + Cloudflare Access (service token):** `cloudflared tunnel create medicar-ia`, ruta a
  `http://localhost:11434`, política de Access que exija un service token; la CF manda `CF-Access-Client-Id` /
  `CF-Access-Client-Secret`. Cloudflare rechaza en el borde todo lo que no traiga el token. Requiere cuenta
  Cloudflare + dominio.
- O un **mini proxy de auth** delante de Ollama que valide el Bearer y recién ahí reenvíe.

Para el prototipo con demo corta y URL efímera, el quick tunnel alcanza; el hardening es para dejarlo prendido.
