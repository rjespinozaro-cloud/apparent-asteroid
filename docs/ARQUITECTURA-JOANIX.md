# JOANIX GUIDES — Arquitectura y funciones (especificación para IA)

Documento para que un agente de programación (ChatGPT, OpenCode u otro) entienda
el proyecto y lo continúe sin romper lo que ya funciona. Lo marcado con
**(verificar)** es lo que debe comprobarse en el código antes de asumirlo.

## 1. Qué es

Plataforma de conocimiento de ciberseguridad ("Cybersecurity Knowledge Lab").
Publica guías prácticas para equipos **RED** (ofensiva) y **BLUE** (defensa), con
rutas de aprendizaje, catálogo de herramientas, búsqueda y un panel de
administración. Las guías BLUE son gratuitas; las RED muestran una vista previa y
el contenido completo se entrega en PDF de pago.

Propuesta de valor: el usuario sabe qué aprender, por dónde empezar, qué guía
seguir y con qué herramienta practicar.

## 2. Stack y restricciones

- Astro (SSR) + `@astrojs/cloudflare` sobre **Cloudflare Workers**.
- **Cloudflare D1** (SQLite), binding `DB`, base `ciberguias`.
- HTML + CSS + JavaScript nativo. Sin React, Vue, Tailwind ni librerías de UI.
- Markdown con renderizador propio (`marked`, HTML crudo desactivado).
- Pruebas con `node:test`.

Restricciones obligatorias:

1. Sin dependencias nuevas sin justificación escrita.
2. Sin estilos ni scripts en línea: la CSP lo bloquea. Todo en archivos.
3. SQL siempre con `prepare().bind()`; nunca concatenar valores del usuario.
4. Nunca editar ni borrar migraciones existentes: añadir una nueva con el
   siguiente número libre.
5. Nunca escribir secretos en el repositorio.
6. No romper autenticación, CSRF, paywall ni compatibilidad con Workers.

## 3. Arquitectura

```text
Navegador
   │
   ▼
Cloudflare Worker (Astro SSR)
   ├─ middleware.js ── Origin/CSRF, sesión en /admin y /api/admin, cabeceras
   ├─ Páginas públicas ── leen D1 (solo guías publicadas)
   ├─ Panel admin ──────── requiere sesión y rol
   └─ API /api/admin/* ─── sesión + rol + CSRF + Origin
            │
            ▼
        src/lib/ ── db/ · auth · markdown · validar · cripto · ia · utils
            │
            ▼
        Cloudflare D1
```

Flujo de una petición admin: middleware (normaliza ruta, valida Origin, carga
sesión) → handler (`validarPeticionAdmin`: sesión, rol, CSRF) → validación
(`validar.js`) → D1 → auditoría.

## 4. Estructura de carpetas

```text
migrations/   0001_esquema · 0002_indices · 0003_auditoria_usuario_nombre
              · 0004_compra_opcional · 0005_catalogo
public/       hero/ (fondos y constelación SVG), assets/, favicons, logo.png
scripts/      importar-guias.mjs · publicar-preview.sh · publicar-pages.sh
docs/         PUBLICAR-PREVIEW.md, arquitectura-ia.md
tests/        unidad.test.js
src/
  components/ TarjetaGuia, TarjetaRuta, Candado, Captura, notas, admin/EditorGuia
  layouts/    Base, AdminBase, Guia
  lib/        auth.js, admin-api.js, markdown.js, validar.js, cripto.js, ia.js,
              db/ (guias, rutas, usuarios, auditoria), utils/texto.js
  pages/      públicas, admin/, api/admin/
  scripts/    JavaScript del navegador (asistente, filtros, editor, lightbox)
  styles/     tokens, base, layout, components, inicio, catalogo, admin, motion
```

## 5. Rutas

### Públicas

| Ruta | Función |
| :-- | :-- |
| `/` | Portal de entrada (fondo, botón Entrar, enlace directo a guías) |
| `/inicio/` | Catálogo: hero, rutas destacadas, guías destacadas, RED/BLUE, herramientas, últimas guías |
| `/guias/` | Catálogo con filtros (equipo, acceso, nivel, herramienta), búsqueda, paginación |
| `/guias/[...slug]` | Lector (p. ej. `/guias/red/nmap-basico/`): índice, relacionadas, anterior/siguiente, candado |
| `/herramientas/`, `/herramientas/[herramienta]/` | Explorador y detalle (guías RED y BLUE de una herramienta) |
| `/rutas/`, `/rutas/[slug]/` | Rutas de aprendizaje con pasos |
| `/buscar/` | Búsqueda GET, mínimo 2 caracteres, `noindex`, `no-store` |
| `/aviso-legal/`, `/404`, `/500`, `/sitemap.xml`, `/robots.txt` | Soporte |

### Admin y API

| Ruta | Método | Acceso |
| :-- | :-- | :-- |
| `/admin/login`, `/admin/instalar` | GET/POST | Libre (instalar solo sin usuarios y con token) |
| `/admin/` | GET | Sesión: métricas y actividad |
| `/admin/guias/`, `/admin/guia-nueva/`, `/admin/guias/[id]/` | GET | Sesión; el editor solo guías BLUE gratuitas |
| `/admin/usuarios/`, `/admin/auditoria/`, `/admin/ajustes-ia/` | GET | Solo `admin` |
| `/api/admin/guias` | POST | Crear (editor solo BLUE gratis) |
| `/api/admin/guias/[id]` | PUT, DELETE | Editar y borrar con la misma regla de rol |
| `/api/admin/guias/[id]/publicar` | POST | Publicar o despublicar (exige enlace de compra en guías de pago) |
| `/api/admin/guias/preview` | POST | Vista previa del Markdown |
| `/api/admin/usuarios`, `/api/admin/usuarios/[id]` | POST, PUT, DELETE | Solo `admin`; protege al último admin y a uno mismo |
| `/api/admin/ajustes-ia` | GET, PUT | Solo `admin`; la API key nunca se devuelve |
| `/api/admin/ia/asistir` | POST | Sesión válida; límites por minuto y mensual |
| `/api/admin/logout` | POST | Sesión actual |

## 6. Modelo de datos (D1)

Tablas: `usuarios`, `sesiones`, `intentos_login`, `guias`, `ajustes_ia`,
`historial_prompt`, `registro_ia`, `auditoria`, y desde la migración 0005
`herramientas`, `rutas`, `ruta_pasos`.

Campos de `guias` relevantes: `slug`, `titulo`, `equipo` (red/blue), `acceso`
(gratis/pago), `nivel`, `herramienta`, `publicada`, `cuerpo_md`, `enlace_compra`
(opcional), `destacada`, `lectura_min`, fecha. El esquema exacto está en
`migrations/` **(verificar)**.

Reglas de datos:

- Listados y búsqueda no devuelven `cuerpo_md` (usan una lista fija de columnas).
- `rutas` y `ruta_pasos`: un paso apunta a una guía; si la guía no está
  publicada se muestra "Próximamente" sin enlace. Las semillas deben enlazar
  guías por `slug`, nunca por id fijo.
- La tipología de una ruta se **deriva**: RED si todos sus pasos son RED, BLUE si
  todos son BLUE, PURPLE si mezcla; nivel = el mayor; duración = suma de
  `lectura_min`.

## 7. Funciones por módulo

### Autenticación (`lib/auth.js`)

`hashPassword`, `comprobarPassword` (PBKDF2-SHA-256, sal por usuario),
`crearSesion`, `obtenerSesion`, `destruirSesion` (token aleatorio, hash en D1,
8 horas), `cookieSesion`, `borrarCookieSesion` (cookie `__Host-`, `HttpOnly`,
`Secure`, `SameSite=Strict`), `csrfValido` (HMAC derivado de la sesión),
`secretoValido` (comparación en tiempo constante), `loginBloqueado`,
`registrarIntentoFallido`, `limpiarIntentos` (5 intentos, 15 minutos, por
usuario+IP y por IP).

### API admin (`lib/admin-api.js`)

`leerEntrada` (JSON o formulario, con control de errores), `respuestaJson`,
`idValido`, `esAdmin`, `permisoGuia`, `permisoEntradaGuia`,
`validarPeticionAdmin` (sesión, rol, CSRF), `metodoNoPermitido`.

### Middleware (`middleware.js`)

Normaliza la ruta (decodificar, colapsar barras, minúsculas), decide si es
`/admin` o `/api/admin`, verifica `Origin` en mutaciones, carga la sesión, aplica
`no-store` y `noindex` al admin, y añade cabeceras de seguridad (HSTS en
producción, `X-Frame-Options`, `nosniff`, COOP, Referrer-Policy). La CSP la emite
Astro con hashes **(un solo CSP)**.

### Markdown (`lib/markdown.js`, `lib/utils/texto.js`)

`markdownAHtml` (escapa HTML crudo, filtra protocolos de enlaces e imágenes,
`rel` seguro en enlaces externos, notas `:::roja` y `:::azul`),
`extraerIndice` (debe generarse del mismo render para que los ids coincidan),
`contarPasos`, `tiempoLectura`, `dividirPreview` (garantiza que una guía de pago
nunca devuelva todo el Markdown), extracción de títulos posteriores al corte.

### Base de datos (`lib/db/`)

Guías: `listarGuias`, `contarGuiasPublicadas` (acepta filtros),
`obtenerGuiaPorSlug`, `obtenerGuiaPorId`, `listarUltimas`, `listarDestacadas`,
`buscarGuias` (en pago, solo coincide con la vista previa), `vecinas`,
`relacionadas`, CRUD admin y `estadisticas`. Herramientas: `listarHerramientas`,
`existeHerramienta`. Rutas: `listarRutas`, `obtenerRuta(slug)` con pasos.
Usuarios: crear, listar, cambiar rol, desactivar, `contarAdminsActivos`.
Auditoría: `registrarAuditoria`, `listarAuditoria` (paginada, filtros).

### Validación (`lib/validar.js`)

Título, slug único, equipo, acceso, nivel, herramienta, longitud del Markdown,
enlace de compra HTTPS obligatorio en pago, usuario, rol y contraseña
(mínimo 12 caracteres).

### Cifrado e IA (`lib/cripto.js`, `lib/ia.js`)

`cripto`: AES-256-GCM con IV aleatorio por registro, clave `MASTER_KEY` desde un
secreto de Wrangler. `ia`: proveedor configurable, API key cifrada, límite por
minuto y tope mensual de tokens, registro en `registro_ia`, historial en
`historial_prompt`.

### Asistente JOANIX AI (navegador)

Usa la búsqueda real de `/buscar/` y clona tarjetas reales. **No es un chatbot
generativo** y no debe presentarse como tal. Estados: curious, searching,
thinking, happy, sad, excellent, suggestion.

## 8. Reglas de negocio críticas

1. **Paywall:** el HTML, JSON-LD, meta, sitemap, búsqueda y asistente de una guía
   de pago nunca contienen el cuerpo bloqueado. Solo la vista previa y, si se
   decide, los títulos posteriores.
2. **Roles:** `admin` hace todo; `editor` solo guías BLUE gratuitas, tanto para
   leer como para editar. La página de detalle debe aplicar `permisoGuia`.
3. **Último admin:** no se puede borrar ni desactivar al último ni a uno mismo.
4. **Publicar una guía de pago** exige URL de compra HTTPS.
5. **Auditoría:** toda acción administrativa, incluido el login correcto, deja
   registro (sin contraseñas, cookies ni tokens). Preferible junto a la mutación
   en `database.batch()`.
6. **Datos de prueba:** nunca publicados; los tests usan una base temporal.

## 9. Diseño

- Dirección "JOANIX Signal": premium, técnico, editorial. Sin Matrix, sin verde
  neón, sin excesos de brillo.
- Fondos `#05060C`, `#07080F`, `#0D0F1A`, `#141726`; borde `#232842`; texto
  `#E8EAF6`; texto secundario `#9AA0C3`.
- Violeta `#8B5CF6` es la marca; fucsia `#E879F9` como acento de interacción.
  **Rojo `#FF4D6D` y azul `#4D7CFF` se reservan para RED y BLUE.**
- Tipografías locales: Bricolage Grotesque (títulos), IBM Plex Sans (texto),
  JetBrains Mono (metadatos y código).
- Un único contenedor (72rem y `padding-inline` fluido) para cabecera, secciones y
  pie. Capa de estrellas fija como fondo de toda la página; secciones
  transparentes con tintes propios.
- Hero de `/inicio/`: constelación JOANIX en SVG animado sobre un fondo sin
  letras, titular en carrusel.
- Movimiento: solo `transform` y `opacity`, máximo 2 o 3 animaciones infinitas,
  `prefers-reduced-motion` respetado.
- Admin: tema propio claro (amarillo y blanco), sin efectos del sitio público.
- Accesibilidad: contraste AA, foco visible, objetivos táctiles de 44 px.

## 10. Estado y trabajo pendiente

Pendiente según la auditoría (prioridad):

1. Aplicar `permisoGuia` en `/admin/guias/[id]` (un editor puede leer guías de pago).
2. Aplicar la migración 0005 en la D1 remota con copia de seguridad y semillas por `slug`.
3. Guía de pago publicada sin enlace de compra.
4. Publicación en Pages: publicar `dist/` directamente, fuentes sin incrustar,
   aviso de funciones dinámicas no disponibles.
5. Auditar el login correcto; agrupar mutación y auditoría en `batch`.
6. Pruebas del paywall, auth, middleware, markdown y usuarios.
7. Panel con estadísticas reales y gestión de destacadas.
8. README real y retirar documentación obsoleta ("INTOCABLE").

## 11. Cómo debe trabajar el agente

1. Leer primero `AGENTS.md` y este documento; no asumir nada de lo marcado
   **(verificar)**.
2. Una fase por vez, con commit antes y después y prueba para cada cambio.
3. Verificar con `npm test`, `npx astro check` y `npm run build`.
4. Clasificar hallazgos como CONFIRMADO, PROBABLE, RIESGO POTENCIAL o NO ES PROBLEMA,
   con archivo y línea. No declarar vulnerabilidades sin evidencia.
5. No ejecutar nada contra la D1 remota que escriba datos.
6. No declarar "listo para producción".
7. Entregar un informe breve: archivos tocados, pruebas, pendientes.
