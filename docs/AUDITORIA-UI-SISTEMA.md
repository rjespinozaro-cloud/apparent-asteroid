# Auditoría UI y estado del sistema

Fecha: 2026-10-20

Este documento recoge la revisión de marca, CSS, estados de interfaz y el
flujo de pago. No sustituye a las pruebas: los comandos de verificación están
al final.

## 1. Marcas: qué asset usar en cada caso

| Caso | Asset | Motivo |
| --- | --- | --- |
| Cabecera pública y panel admin (fondo oscuro) | `public/brand/logo-joanix-oscuro.svg` | Wordmark blanco transparente; contraste correcto sobre `#05060C`. |
| Fondos claros, documentos, facturas o impresión | `public/brand/logo-joanix.svg` | Wordmark oscuro transparente; reservado para superficies claras. |
| Portada, avatar o marca de agua | `public/brand/icono-joanix-sin-fondo.svg` | Icono transparente; no lleva banner ni caja. |
| Favicon, apple-touch y avatar pequeño | `public/brand/icono-joanix.svg` + PNG/ICO | El fondo cuadrado garantiza legibilidad a 16–32 px. |
| Open Graph / Twitter | `public/brand/og-image.png` | 1200 × 630, wordmark blanco sobre fondo oscuro. |
| Backups y fuentes | `logos-final/` | No se publica; conserva originales y variantes antiguas. |

Los assets de `public/` son los canónicos. `logos-final/` no debe enlazarse
desde plantillas ni scripts de publicación.

## 2. CSS: huecos corregidos

Se añadieron estilos para clases que ya existían en el marcado pero no tenían
regla propia:

- `.continua`, `.continua__enlace`, `.continua__etiqueta`, `.continua__titulo`:
  el bloque «Continúa donde lo dejaste» aparecía como texto suelto.
- `.admin-visitas__columna`: `min-width: 0` para evitar desbordes en la rejilla.
- `.admin-visitas__lista--ordenada`: recupera numeración y sangría.
- `.admin-topbar__migas`, `.admin-topbar__salir`: contención y alineación.
- `.admin-asistente`: separación entre respuesta y editor.
- `.doc-callout--violeta`: variante explícita (antes heredaba el color base).
- `.catalogo-stat--violet`: tono explícito para el contador total.
- `.candado__cabecera`, `.candado__precio`, `.candado__compra`,
  `.candado__cta`, `.candado__sellos`, `.candado__pago-nota`: ficha de compra.
- `.tarjeta__precio`: precio legible en las tarjetas del catálogo.
- `.admin-form__nota`: ayuda contextual de los campos de pago.

### Clases sin regla propia que son intencionales

La auditoría estática sigue detectando estas clases, pero no son fallos
visuales:

- `stretched-link`: el enlace se estira con `.tarjeta__titulo a::after`.
- `asistente-mascota--md`: el tamaño base ya es 48 px / 40 px.
- `cta__label`, `rutas-hero__titulo`, `niveles__nombre`: heredan del elemento
  contenedor o del `h1`.
- `nodo__desc--fija`: el estado lo cubre `.nodo--proximamente`.
- `tarjeta--destacada`, `tarjeta--herramienta`: variantes semánticas que usan
  el estilo base de `.tarjeta` / `.tarjeta-premium`.
- `reduce-motion` y `nodo__progreso--hecho`: hooks de JavaScript; la reducción
  de movimiento real se aplica con `prefers-reduced-motion`.

## 3. Deuda de interfaz detectada

- Objetivos táctiles por debajo de 44 px: enlaces de la cabecera (40 px),
  «Premium» (36 px), migas (32 px) y el `<summary>` del índice (21 px). No
  rompen la lectura, pero conviene subirlos en la revisión móvil.
- El aviso proactivo del asistente flotante tapaba el bloque de compra en la
  lectura de una guía. Se desactiva ese globo en `/guias/<slug>/`; el lanzador
  sigue disponible.
- La cabecera fija puede tapar el inicio del bloque premium al hacer scroll.
  El `scroll-margin` de la guía y los anclajes debe revisarse en móvil.
- Lighthouse: accesibilidad 100 en portada y guía; el login de admin quedó en
  0,95. Revisar contraste de ayudas/placeholder antes de la entrega.
- No hay scroll horizontal de página en las vistas medidas. Los desbordes de
  `cover__bg`, `cover__photo` y el aro de la portada son decorativos.

## 4. Pago: lo que ya está hecho

- `guias` guarda `precio_centimos`, `moneda` (ISO 4217) y `pasarela`
  (`stripe`, `lemonsqueezy`, `polar` o `manual`) desde la migración
  `0007_pago_guias.sql`.
- El editor del panel permite fijar precio, moneda y pasarela, y explica que el
  checkout es externo.
- La tarjeta del catálogo muestra el precio y cambia la llamada a la acción a
  «Comprar PDF» cuando hay checkout; si falta, mantiene «Ver detalles».
- El bloque premium muestra precio, condiciones, botón grande, pasarela y
  aviso de que JOANIX no almacena datos de tarjeta.
- La tarjeta y el bloque premium enlazan primero a `/comprar/<slug>/`, una
  página interna con resumen, qué incluye, proceso y precio. Esa página es la
  única que abre el checkout alojado, en pestaña nueva y con
  `rel="nofollow noopener noreferrer"`.
- El flujo se comparte desde `src/lib/pago.js`: normaliza base, precio, nombre
  de pasarela, enlace HTTPS y URL interna. Las tarjetas, el bloque premium y
  la página de compra no duplican reglas.
- La página de compra es `noindex`, no entra en el sitemap y no renderiza el
  cuerpo bloqueado: solo títulos de sección de la vista previa.
- Las guías de pago con precio generan JSON-LD `Product` + `Offer`; la oferta
  apunta al resumen interno, no al checkout externo.
- El enlace sigue siendo un checkout alojado: no se manejan tarjetas en el
  Worker ni se inventan claves de proveedor. Si no hay precio, se muestra
  «Precio en la tienda»; si no hay enlace HTTPS, la compra aparece como no
  disponible.

## 5. Pago: lo que falta para cobrar de verdad

Orden recomendado:

1. **Elegir proveedor.** Para venta internacional de PDFs, Lemon Squeezy o
   Polar simplifican IVA/facturas al actuar como merchant of record. Stripe
   Payment Links da más control y comisiones menores, pero JOANIX asume la
   gestión fiscal. El pago manual/Bizum solo como salida temporal.
2. **Configurar producto y checkout.** Precio, moneda, impuestos, URL de
   éxito/cancelación y metadatos con `guia_slug`.
3. **Webhook firmado e idempotente.** Endpoint `/api/webhooks/<proveedor>`;
   verificar firma, guardar `evento_id` único y no conceder dos veces.
4. **Persistencia de compras.** Insertar en `compras` (pedido, email, importe,
   moneda, pasarela, estado) y crear el acceso en `accesos_guias`.
5. **Entrega segura.** PDFs en R2 privado y URL firmada temporal, o entrega
   gestionada por el proveedor. Nunca un PDF público en `public/`.
6. **Identidad del comprador.** Para no construir cuentas públicas desde cero,
   usar enlace mágico o token de descarga hasheado con caducidad. Si se quieren
   progreso/favoritos, hace falta una tabla de clientes separada de `usuarios`
   (que hoy es solo admin/editor).
7. **Email.** Confirmación, recibo y enlace de descarga; plantillas y rebotes.
8. **Reembolsos y disputas.** El webhook de reembolso debe revocar el acceso y
   reflejarlo en `/admin/ventas/`.
9. **Operación.** Visor de ventas con filtros, concesión manual, reenvío de
   acceso y exportación; alertas de fallo de webhook.
10. **Legal.** Sustituir `[NOMBRE]`, `[CORREO]` y los datos pendientes del
    aviso legal; publicar condiciones de compra, privacidad y política de
    reembolsos reales.

## 6. Otros huecos de sistema

- No hay cuentas públicas ni sesión de alumno; `src/lib/db/alumno.js` y las
  tablas de progreso/favoritos no están conectadas a un flujo real.
- `compras` y `accesos_guias` existen, pero no hay webhook ni entrega.
- No hay almacenamiento privado de PDFs ni envío de correo.
- `/admin/ventas/` es solo lectura y no permite conceder/revocar accesos.
- No hay pruebas E2E de compra, webhook, descarga ni reembolso.
- Las visitas son anónimas y agregadas; si se añade analítica externa, hace
  falta consentimiento y actualizar la política de cookies.
- Faltan datos legales reales y textos de reembolso definitivos.

## 7. Verificación

```bash
npm run check
npm test
npm run build
git diff --check
```

La migración local se aplica con `npm run db:migrate`. Antes de desplegar hay
que aplicar `0006` y `0007` en remoto con `npm run db:migrate:remote`; el orden
importa porque las consultas nuevas leen `precio_centimos`, `moneda` y
`pasarela`.
