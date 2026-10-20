# Auditoría de plataforma, panel y tienda — JOANIX

Fecha: 2026-10-20 · Base: `main` tras `feat(pago)`, `feat(admin)` y
`fix(admin)`.

Alcance: panel de administración (`src/pages/admin/**`, `src/pages/api/admin/**`),
portal público y tienda (`src/pages/**` fuera del panel), capa de datos
(`src/lib/db/**`), migraciones `0001`–`0008` y estilos del panel.

Método: lectura del código, inspección de la D1 local y remota, ejecución del
servidor de desarrollo, capturas del navegador, Lighthouse y el detector
mecánico de la skill `impeccable`. Cada hallazgo crítico se reprodujo antes
de reportarlo.

---

## 1. Veredicto

| Superficie | Estado | Nota |
|---|---|---|
| Panel de administración | Sólido en estructura, con una fuga de contenido y varias incoherencias de rol | 7 módulos, 12 endpoints, todos con sesión y CSRF |
| Portal público | Muy buen nivel de SEO y accesibilidad | Lighthouse 100/100/100 en portada, catálogo, ficha y compra |
| Tienda | **Embudo sin cola de entrega** | No hay webhook, ni entrega, ni correo, ni comprador posible en el modelo de datos |
| Capa de datos | Correcta y bien parametrizada | Sin inyección SQL; sí faltan índices y hay tablas muertas |

---

## 2. P0 — bloquean la publicación o la venta

### 2.1 La D1 remota está en `0005` y `main` no es desplegable

```
d1_migrations (remoto): 0001 0002 0003 0004 0005      ← faltan 0006, 0007, 0008
sqlite_master (remoto): sin compras, accesos_guias, progreso_rutas,
                         guias_completadas, favoritos, metricas_visitas
PRAGMA table_info(guias): sin precio_centimos, sin moneda, sin pasarela
```

`COLUMNAS_LISTADO` (`src/lib/db/guias.js`) consulta esas columnas desde
`b8226a7`, así que un despliegue sin migrar rompe el catálogo público:

```
SELECT ... precio_centimos ... FROM guias
→ no such column: precio_centimos at offset 119: SQLITE_ERROR [code: 7500]
```

**Acción**: `npm run db:migrate:remote` en orden `0006 → 0007 → 0008`
(`0007` es `ALTER TABLE` sobre `guias`).

### 2.2 El CTA público apunta al alta de Stripe, no a un checkout

`guias.enlace_compra` = `https://dashboard.stripe.com/register/oauth/secondary`
y `estadoCompra()` (`src/lib/pago.js`) solo exige el esquema `https`. Resultado:
la tarjeta y `/comprar/<slug>/` muestran **«Continuar al pago seguro»** y abren
el registro OAuth de una cuenta Stripe.

No está en producción todavía —la vista previa publicada dice «Este PDF todavía
no está a la venta»— pero **se publicaría así en cuanto subiese el árbol
actual**.

**Acción**: limpiar el enlace en la D1 y validar la coherencia
`pasarela ↔ host` (`buy.stripe.com`, `*.lemonsqueezy.com`, `*.polar.sh`;
denegar `dashboard.*`).

### 2.3 El modelo de datos no admite comprador

`compras.usuario_id` es `NOT NULL REFERENCES usuarios(id)` y `usuarios.rol`
tiene `CHECK IN ('admin','editor')`: una compra solo puede atribuirse a un
administrador. `accesos_guias`, `progreso_rutas`, `guias_completadas` y
`favoritos` heredan el mismo error de modelo.

**Acción**: tabla `cuentas` propia para compradores y migrar
`compras.usuario_id` → `compras.cuenta_id`.

### 2.4 La UI promete una entrega que no existe

No hay webhook (`src/pages/api/` solo tiene `admin/`), ni PDFs, ni binding R2,
ni correo. Pero el texto dice «Recibirás la confirmación y las instrucciones de
entrega», «la pasarela gestiona el cobro y la entrega del PDF» y, en
`/admin/ventas/`, «las compras se crean desde el webhook de pago».

**Acción**: unificar la promesa (recomendación: «el proveedor se encarga del
cobro; te enviamos el enlace de descarga por correo») o desactivar el CTA
mientras no exista entrega.

### 2.5 El rol `editor` podía leer el cuerpo completo de guías RED y de pago

`admin/guias/[id].astro` no aplicaba `permisoGuia`: entregaba `cuerpo_md`
íntegro en el textarea. La API sí lo bloqueaba al guardar, pero la lectura no
estaba protegida en ningún sitio.

**Corregido** en `fix(admin): el rol editor no puede leer contenido premium ni
romper el guardado`.

---

## 3. P1 — fiabilidad, integridad y coherencia

| # | Hallazgo | Referencia |
|---|---|---|
| 6 | `estadoCompra()` valida solo `https`: un panel de proveedor pasa como checkout | `src/lib/pago.js:71-73` |
| 7 | **Dinero en coma flotante**: `compras.monto REAL` frente a `guias.precio_centimos INTEGER` | `migrations/0006:13` |
| 8 | **Borrar un usuario borra su histórico de compras** (CASCADE) sin copiar el nombre → pérdida contable | `src/lib/db/usuarios.js:79-88` |
| 9 | `purgarSesionesCaducadas` y `purgarIntentos` **nunca se invocan** (el comentario afirma lo contrario) | `src/lib/db/usuarios.js:95-101`, `src/lib/auth.js:237` |
| 10 | N+1 en `listarRutasConTipologia` (1+2N) y `listarGuiasCamino` carga el `cuerpo_md` de todas las guías en `/inicio/` y `/rutas/` | `src/lib/db/rutas.js:130-137`, `src/lib/db/guias.js:666` |
| 11 | El asistente **raspa el HTML** de `/buscar/` y `/rutas/`: dos renders completos por búsqueda | `src/scripts/asistente.js:273-290` |
| 12 | **Dos sistemas de progreso**: `localStorage` en el portal y `progreso_rutas` en D1, sin usar | `src/scripts/progreso-camino.js:12` |
| 13 | El panel **no expone 5 de 14 tablas** (rutas, ruta_pasos, herramientas, sesiones, intentos_login) ni 8 columnas de `guias` | `src/pages/admin/**` |
| 14 | `markdown.js` usa un `Map` de módulo para las anclas → dos renders concurrentes pueden duplicar ids | `src/lib/markdown.js:39,144-167` |
| 15 | **Cuatro textos distintos de «qué incluye»** y dos juegos de sellos; el panel promete que la ficha muestra «Precio en la tienda» y la ficha nunca lo dice | `Candado.astro:46-88`, `comprar/[...slug].astro:44-52,190-203`, `EditorGuia.astro:135` |
| 16 | Páginas indexables con marcadores (`[NOMBRE]`, `[CORREO]`, `[BIO]`, `[POLÍTICA PENDIENTE]`) y el aviso legal dice «no rastreamos tu actividad» mientras el middleware registra visitas agregadas | `nosotros/`, `etica/`, `aviso-legal/` vs `src/middleware.js:67-83` |
| 17 | Sitemap y `getStaticPaths` **truncados a 48 guías** | `src/lib/db/guias.js:161` |
| 18 | `src/middleware.js` (186 líneas) y `src/lib/cripto.js` **sin un solo test**; ningún endpoint admin está probado | — |
| 19 | PBKDF2 con **100 000 iteraciones** (recomendado ≈600 000) | `src/lib/auth.js:6,65` |
| 20 | El listado del panel muestra el catálogo entero (RED y no publicado) al rol `editor` | `listarGuiasAdmin` |

---

## 4. P2/P3 — calidad

- Contadores de los chips contextuales: en `/guias/?acceso=pago` el chip
  «Gratis» muestra `0`.
- «Ver detalles →» es un `<span aria-hidden="true">`: no es un enlace y su
  texto desaparece para lectores de pantalla (`TarjetaGuia.astro:84-86`).
- Saltos de encabezado h1 → h3 en `/guias/` y `/buscar/`.
- Sin CTA de compra en `/rutas/[slug]/` aunque un paso sea de pago.
- Formato de fechas inconsistente en seis pantallas del panel.
- Botones de rol sin nombre accesible (`"admin →"`, `"activo → desactivar"`).
- `role="status"` usado también para errores; `<time>` sin `datetime`.
- El estado «compra no disponible» de `/comprar/` responde 200 y se cachea 5 min.
- `ADMIN-DIRECCION.md` describe un tema **light** que no existe.
- `README.md` conserva el boilerplate del starter de Astro.
- Detector mecánico: `gradient-text` (`camino.css:839`) y dos `side-tab`
  (`documento.css:185,320`).
- **Dos escalas tipográficas** (`tokens.css` y `admin-tokens.css`) con tres
  hex y dos fórmulas duplicadas; los nombres están bien prefijados, los
  valores no.

---

## 5. Plan de mejoras

| Bloque | Trabajo | Esfuerzo |
|---|---|---|
| **0 · Antes de publicar** | `db:migrate:remote` (0006→0007→0008) · limpiar el enlace de ejemplo · validar `pasarela ↔ host` · copy honesto sobre la entrega | 2–3 h |
| **1 · Seguridad e integridad** | Listado del panel filtrado por rol · `nombre_comprador` en `compras` y `monto` en céntimos · purgas en el middleware · auditar el uso correcto del asistente IA | 1 día |
| **2 · Contenido** | CRUD de rutas y herramientas · columnas de nivel, última edición y checkout en el listado · checklist de publicación · unificar «qué incluye» y sellos · cerrar los marcadores legales | 2–3 días |
| **3 · Flujo de venta** | Tabla `cuentas` · webhook firmado e idempotente · correo de entrega · PDF en R2 con URL firmada · estado «ya comprado» · reembolsos que revocan el acceso | 1–2 semanas |
| **4 · Calidad** | Tests de `middleware.js` y `cripto.js` · primer test de endpoint · N+1 de rutas · quitar `cuerpo_md` de `listarGuiasCamino` · API de búsqueda para el asistente · unificar escalas tipográficas | 2–3 días |

---

## 6. Módulos a integrar

### 6.1 Panel de administración

| Módulo | Qué aporta | Datos que ya existen |
|---|---|---|
| **Tienda y pagos** ⭐ | Ajustes de tienda (pasarela por defecto, moneda, IVA, política de reembolso), validación de enlaces, cobros con filtros, conceder/revocar acceso, reenviar entrega, conciliación y exportación CSV | `compras`, `accesos_guias` |
| **Cuentas de comprador** | Tabla `cuentas` (email, nombre, verificado) y ficha del cliente: compras, guías desbloqueadas, rutas en curso. **Prerrequisito de todo lo anterior** | migración nueva |
| **Entrega de PDFs** | Subir PDF a R2, versionarlo, vincularlo a la guía, enlace firmado con caducidad, historial de descargas | `guias` + R2 |
| **Rutas** ⭐ | CRUD de rutas y pasos: reordenar, publicar, destacar, editar la nota del paso. Hoy el «camino de leyendas» no se puede tocar | `rutas`, `ruta_pasos` |
| **Herramientas** | Nombre, descripción, destacada y orden. Hoy la tabla es decorativa | `herramientas` |
| **Embudo de conversión** ⭐ | Visitas → ficha → `/comprar` → compra, por guía/equipo/herramienta; guías con más intención de compra | `metricas_visitas` + `compras` |
| **Checklist de publicación** | Antes de publicar: precio, checkout, resumen, keywords, pareja RED/BLUE, tiempo de lectura | `guias` |
| **Historial de versiones** | Diff por edición (slug, precio, enlace, cuerpo) y restauración | tabla nueva |
| **Sesiones y accesos** | Sesiones activas, cerrar todas, 2FA (TOTP), invitaciones, lista de bloqueos | `sesiones`, `intentos_login` |
| **Registro del asistente IA** | Consumo real por llamada, usuario, modelo y coste; hoy `registro_ia` se guarda y no se ve | `registro_ia` |
| **Salud del sistema** | Migraciones aplicadas, purgas pendientes, tamaño de D1, estado del webhook | `d1_migrations` |
| **Notas de equipo** | Comentarios internos por guía (revisión, pendientes) | tabla nueva |

### 6.2 Portal y tienda

| Módulo | Nota |
|---|---|
| **Checkout real** ⭐ | Webhook + estado de compra + correo + descarga firmada. Atajo: «recuperar mi compra» por correo con token, que evita construir el sistema de cuentas |
| **«Mis guías» / descargas** | Los PDFs comprados, con re-descarga. `accesos_guias` ya está |
| **Estado «ya comprado»** | Hoy quien vuelve a la guía ve «Comprar PDF» y puede pagar dos veces |
| **`/premium/`** ⭐ | Landing de la oferta: qué incluye, para quién, garantía, FAQ. El menú «Premium» va hoy a un filtro del catálogo |
| **Paquetes y licencias** | Bundle RED+BLUE (la pareja ya existe en `guia_pareja`) y licencias por equipo |
| **Favoritos y biblioteca** | `favoritos` está creada y sin interfaz |
| **Progreso real de rutas** | `progreso_rutas` y «continúa donde lo dejaste» de verdad, sustituyendo el `localStorage` |
| **Soporte** | Formulario de «problema con mi compra» con ticket, en lugar de `[CORREO]` |
| **Descuentos y campañas** | Códigos, precio con descuento y bundles |
| **Novedades** | «Te avisamos cuando publicemos una guía de Nmap» y changelog para quien compró |
| **API del asistente** | Contexto por índice propio en vez de raspar HTML |
| **Licencia y RGPD** | Licencia de uso del PDF, privacidad de la compra, política de cookies |

### 6.3 Lo que no se integraría todavía

Suscripción (contradice el sello «Sin suscripción»), gamificación y un gestor
de contratos: con dos guías y una venta no aportan nada y multiplican el
alcance.

---

## 7. Verificación de esta auditoría

```bash
npm run check            # 0 errores, 0 warnings
npm test                 # 114/114
npm run build            # OK
PAGES_BUILD=1 npx astro build   # OK

# Estado de la base de datos remota (solo lectura)
npx wrangler d1 execute ciberguias --remote --command "SELECT name FROM d1_migrations ORDER BY id"
npx wrangler d1 execute ciberguias --remote --command "PRAGMA table_info(guias)"
```

Lighthouse (accesibilidad, buenas prácticas, SEO): 100/100/100 en `/`,
`/guias/`, `/guias/<slug>/` y `/comprar/<slug>/`.
