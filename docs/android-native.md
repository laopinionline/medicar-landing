# MEDICAR Socio — app nativa Android (Capacitor)

App nativa que empaqueta la PWA `socio/` con Capacitor. Sirve sobre todo para el **push nativo**
(FCM; en la web/PWA el push a iOS/Android nativo no llega). `appId = ar.com.medicaronline.socio` (definitivo, ITECNIS).

## google-services.json (credenciales Firebase) — NO se versiona
- Vive en `android/app/google-services.json`. **NO está en git** (decisión de Lucas: no subirlo a ningún lado).
- `android/` entero está gitigneado (lo regenera Capacitor). El único archivo NO regenerable es este.
- **Si `android/` se rehace** (`npx cap add android` tras borrar la carpeta): recolocar el archivo a mano.
  - Fuente canónica: **Firebase console → proyecto `medicar-sistema` → ⚙ Configuración → app Android
    `ar.com.medicaronline.socio` → descargar `google-services.json`** → copiar a `android/app/`.
- `npx cap sync android` (uso normal) **NO** borra el archivo; solo se pierde si se elimina la carpeta `android/`.
- Verificación rápida del archivo correcto (sin abrirlo): package `ar.com.medicaronline.socio`, project_id `medicar-sistema`, project_number `598531879440`.

El build lo consume solo: `android/app/build.gradle` aplica `com.google.gms.google-services` **si el JSON existe**
(classpath `com.google.gms:google-services:4.4.0` en `android/build.gradle`). Con el archivo en su lugar, el push queda cableado.

## Rebuild tras cambios en la PWA
```
npx cap sync android      # copia socio/ a android/app/src/main/assets/public + actualiza plugins
```
(Los web assets embebidos ya incluyen la última PWA — SW v33 / MEDICAR IA.)

## Probar el push en un dispositivo REAL — qué necesita hacer Lucas
El backend de push ya está (CFs A2-a/A2-b encolan y envían vía FCM; ver [[project-medicar-app-nativa]]).
Lo que falta es correr la app en un teléfono y registrar el token. Pasos:

1. **Android Studio** instalado. Abrir el proyecto: `npx cap open android`.
2. **Teléfono Android** conectado por USB con *depuración USB* activada (o un emulador con Google Play).
3. **Run ▶** en Android Studio → instala y abre la app (build *debug*, alcanza para probar push).
   - Al iniciar sesión como socio, la PWA registra el token FCM (`push_tokens/{uid}/dispositivos/{deviceId}`) —
     solo dentro de la app nativa (`esAppNativa()`), no en el navegador.
4. Disparar un push real: reservar/cancelar un turno (aviso A2-a) o esperar el recordatorio A2-b. Debería llegar
   a la barra de notificaciones del teléfono.

### Camino Play Store (internal testing) — para probar como se instala de verdad
- **Firma: Play App Signing** (ITECNIS). Lucas genera su **propia upload key** (keystore local; NO hay keystore
  compartido). En Android Studio: *Build → Generate Signed Bundle/APK → AAB → crear keystore de upload*.
- Lucas ya tiene **invitación a Play Console** (acceso solo a la app MEDICAR). Subir el **AAB** a
  **Internal testing** → agregar testers (mails) → link de instalación.
- ⚠️ Por ser **app de salud**, Play pedirá al **publicar**: **Data Safety form**, **URL de política de privacidad**
  y posiblemente **declaración de Health apps**. **No bloquea el internal testing**, sí la publicación pública.
  → Preparar la política de privacidad + el Data Safety antes de salir de testing.

### Orden sugerido
1. Run debug en un teléfono conectado → validar que el token se registra y el push llega. (Lo más rápido.)
2. Luego AAB firmado → internal testing en Play → validar la instalación real + push en varios equipos.
3. Antes de publicar: Data Safety + política de privacidad + Health declaration.
