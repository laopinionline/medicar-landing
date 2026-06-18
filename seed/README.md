# Seed de usuarios demo — Medicar (Etapa 1)

Crea/asegura los 3 usuarios demo como **cuentas Auth reales** y sus documentos en
`usuarios/{uid}` en Firestore, de forma **idempotente** (si ya existen, no duplica).

| Email | Password | Rol |
|---|---|---|
| `afiliado@demo.com` | `123456` | afiliado |
| `medico@demo.com` | `123456` | medico |
| `admin@demo.com` | `123456` | admin |

> Firebase Auth exige contraseñas de **mínimo 6 caracteres**, por eso es `123456`.

---

## 1. Generar la service account key (NO se commitea)

1. Firebase Console → proyecto **medicar-sistema**.
2. ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
3. Botón **Generar nueva clave privada** → **Generar clave**. Se descarga un `.json`.
4. Renombralo a **`serviceAccountKey.json`** y colocalo **dentro de esta carpeta** (`seed/`).

> ⚠️ Es **secreta**: da acceso total al proyecto. Ya está en `.gitignore` (`seed/serviceAccountKey.json`).
> Nunca la subas al repo ni la compartas. Si se filtra, revocala en la misma pantalla de Cuentas de servicio.

Alternativa sin renombrar: exportá la ruta del JSON en una variable de entorno:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/tu/clave.json"
```

## 2. Instalar dependencias y correr

```bash
cd seed
npm install
npm run seed        # o: node seed.js
```

Salida esperada (primera corrida):

```
[auth] creado:   afiliado@demo.com -> <uid>
[doc]  creado:   usuarios/<uid>
...
[seed] Listo. 3 usuarios demo asegurados. Password: 123456
```

Si lo corrés de nuevo, dirá `ya existe` / `merge` — no duplica nada.

## 3. (Aparte) Publicar las security rules

Las reglas están versionadas en `../firestore.rules`. Para aplicarlas, en la consola:
Firestore → **Reglas** → pegar el contenido de `firestore.rules` → **Publicar**.
(O con Firebase CLI: `firebase deploy --only firestore:rules`.)
