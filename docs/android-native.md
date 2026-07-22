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
1. Run debug en el emulador → validar que el token se registra y el push llega. (Lo más rápido.)
2. Luego AAB firmado → internal testing en Play → validar la instalación real + push.
3. Antes de publicar: Data Safety + política de privacidad + Health declaration.

## Upload key (Play App Signing) — firma del AAB
Play App Signing: Google custodia la clave de firma real; Lucas firma el AAB con su **upload key** propia
(no se comparte con nadie). Generar UNA vez con keytool (Lucas elige la contraseña; NO se guarda en el repo):

```
/opt/homebrew/opt/openjdk/bin/keytool -genkeypair -v \
  -keystore ~/medicar-keys/medicar-upload-keystore.jks \
  -alias medicar-upload \
  -keyalg RSA -keysize 2048 -validity 10950
```
- Correr en **Terminal.app** (keytool pide la contraseña de forma interactiva). `~/medicar-keys/` ya existe (permisos 700).
- validity 10950 días ≈ 30 años. Alias: `medicar-upload`.
- **Ubicación:** `~/medicar-keys/medicar-upload-keystore.jks` — FUERA del repo, NO versionado. La contraseña NO va
  a ningún archivo del repo; Lucas la guarda en su gestor de contraseñas.
- ⚠️ **BACKUP CRÍTICO:** si se pierde el `.jks` o la contraseña, NO se pueden subir actualizaciones con la misma
  identidad de upload. Con Play App Signing hay recuperación (resetear la upload key vía soporte de Google) pero
  es engorroso. → Respaldar el `.jks` + la contraseña en el gestor de contraseñas y una copia en un lugar seguro
  (disco externo / nube privada). Nunca en el repo.

**Uso en Android Studio:** Build → *Generate Signed Bundle / APK* → **Android App Bundle** → *Choose existing…* →
apuntar a `~/medicar-keys/medicar-upload-keystore.jks` → alias `medicar-upload` → tipear la contraseña → build →
sale el `.aab` para subir a Play (Internal testing).

## Gradle JDK — error "Gradle 8.2.1 incompatible con JVM 21"
Android Studio nuevo trae JBR **21** embebido; el Gradle 8.2.1 que scaffoldea Capacitor 6 soporta Java **≤19**.
**Fix seguro (sin tocar el build): apuntar el Gradle JVM a un JDK 17** (Gradle/AGP quedan intactos → no rompe
Capacitor). En la máquina de Lucas ya hay un JDK 17 (`jbr-17`, en `~/Library/Java/JavaVirtualMachines/jbr-17.0.14`).
- Se setea en `android/.idea/gradle.xml`: `gradleJvm = "jbr-17"` (ya aplicado localmente).
- ⚠️ `android/.idea/` lo regenera Android Studio al abrir un `android/` nuevo → **tras un `npx cap add android`
  hay que rehacer este ajuste** (igual que el google-services.json). Se hace en la UI (abajo).

**En Android Studio (ruta del menú):**
`Android Studio → Settings…` (⌘,) → **Build, Execution, Deployment → Build Tools → Gradle** → campo
**Gradle JDK** → elegir **jbr-17** (JetBrains Runtime 17) de la lista → **OK** → cuando ofrezca **Sync Now**
(o **Sync Project with Gradle Files**, ícono del elefante 🐘 arriba), aceptar. El error desaparece.
- Alternativa (NO recomendada acá): subir el Gradle wrapper a 8.5+ para soportar Java 21 — toca el build y se
  pierde en cada `cap add` → más frágil para Capacitor. Preferimos el JDK 17.

## Emulador con Google Play (probar push sin teléfono)
Lucas no tiene teléfono Android → emulador. **Requiere Android Studio (todavía no está instalado).** Push (FCM)
solo funciona con una imagen que traiga **Google Play services** → elegir una imagen con **Play Store**.

1. **Instalar Android Studio:** developer.android.com/studio → descargar el `.dmg` → arrastrar a Aplicaciones →
   abrir → asistente *Standard* (instala SDK + emulador). (Trae su propio JDK.)
2. **Crear el emulador (AVD) con Google Play:**
   - En Android Studio: barra lateral derecha **Device Manager** (ícono de teléfono) → **+ Create Virtual Device**.
   - Elegir un teléfono, p.ej. **Pixel 7** → *Next*.
   - En la lista de imágenes del sistema, elegir una fila que tenga el **ícono de Play Store** en la columna
     (esa = imagen con **Google Play**, la que trae FCM). Si dice *Download*, descargarla → *Next* → *Finish*.
   - ⚠️ NO elegir una imagen "Google APIs" sin Play Store para esto: preferir la que dice **Google Play**.
3. **Correr la app:**
   - `npx cap open android` (abre el proyecto en Android Studio).
   - En la barra superior, en el desplegable de dispositivos, elegir el emulador recién creado.
   - Botón **Run ▶**. Levanta el emulador, instala y abre MEDICAR Socio.
4. **Ver que el token FCM se registró:** loguearse como socio en la app del emulador. El token queda en
   **Firebase console → Firestore → `push_tokens/{uid}/dispositivos/{deviceId}`** (campo `token`, `plataforma:android`).
   Si aparece ese doc, el push está listo. Disparar una prueba: reservar/cancelar un turno (aviso A2-a).
