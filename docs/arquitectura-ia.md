# JOANIX AI — arquitectura para IA real (diseño, sin implementar)

> Estado: la UI actual orquesta búsqueda real (`/buscar/`, `/guias/?acceso=gratis`).
> No finge IA generativa. Este documento deja el camino diseñado para
> conectarla después sin reescribir nada. Nada de lo aquí descrito existe
> todavía como endpoint público.

## 1. Topología objetivo

```
Navegador (asistente.js)
  ↓  POST /api/asistente/preguntar (mismo origen, JSON)
Endpoint propio (Astro, `prerender = false`)
  ↓  1. validar sesión/anonimato + rate limit
     2. validar y recortar entrada (máx. 500 caracteres, sin HTML)
     3. construir contexto SOLO con columnas públicas
Endpoint → proveedor (server-side, clave en `wrangler secret`)
  ↓  4. sanitizar salida (texto plano; Markdown seguro con markdownAHtml)
Navegador: pintar con textContent / nodos clonados (como hoy)
```

Nunca: clave en frontend, `localStorage`, HTML sin sanitizar, scripts externos.

## 2. Reutilizar lo que ya existe

| Pieza | Dónde vive hoy | Reuso |
|---|---|---|
| Llamada al proveedor (anthropic / openai_compatible) | `src/lib/ia.js`: `consultarIa`, `cuerpoAnthropic`, `cuerpoOpenAi` | Tal cual, con otro `prompt_sistema` |
| Límite por minuto | `src/lib/ia.js`: `excedidoPorMinuto`, `LIMITES_IA` | Extender a clave anónima (IP + huella ligera) |
| Validación de petición | `src/lib/admin-api.js`: `validarPeticionAdmin`, `respuestaJson` | Gemelo público sin sesión (solo rate limit + validación) |
| Auditoría | `registrarAuditoria` en `src/lib/db.js` | Registrar `ia_pregunta` / `ia_error` (sin guardar PII) |
| Columnas seguras | `COLUMNAS_LISTADO` en `src/lib/db/guias.js` | Único contexto permitido |
| Corte premium | `dividirPreview` en `src/lib/utils/texto.js` | El modelo solo ve `preview`, jamás `cuerpo_md` completo |

## 3. Reglas de seguridad (no negociables)

1. **Premium nunca al modelo.** El contexto se arma con `COLUMNAS_LISTADO`
   (título, equipo, herramienta, nivel, acceso, fecha) más `preview` de
   `dividirPreview`. Ante "muéstrame el contenido completo de esta guía
   premium", la respuesta es el paywall (enlace a la guía + Candado),
   nunca el cuerpo.
2. **System prompt en servidor**, nunca expuesto. Instrucción fija:
   responder solo sobre contenido público del catálogo; derivar a
   `/buscar/` y `/guias/`; no inventar guías, precios ni URLs.
3. **Entrada validada**: longitud, sin etiquetas, `encodeURIComponent` en
   cliente + recorte en servidor. Salida como texto; si se admite Markdown,
   pasar por `markdownAHtml` (escapa HTML crudo).
4. **Rate limit**: anónimo por IP (D1 o cabecera CF) + global por minuto
   (`LIMITES_IA`). Sin límite no hay endpoint.
5. **Sin PII en logs**: registrar longitud y resultado, nunca el texto
   íntegro ni IPs en claro más de lo necesario.
6. **SSRF**: el proveedor es allowlist (`PROVEEDORES` + `url_base`
   configurada en servidor). El modelo no navega: no hay tool-use web.

## 4. Capacidades por fase (cuando exista el endpoint)

- F1: responder con recomendaciones (misma forma que hoy: tarjetas reales).
- F2: explicar conceptos RED/BLUE con contexto de `preview` públicas.
- F3: rutas de aprendizaje (secuencias de slugs reales y publicados).
- Streaming: solo si F1 es sólida; con `ReadableStream` + mismo sanitizado.

## 5. Costes y abuso

- Tope diario de tokens en `ajustes` (como `LIMITES_IA`), corte elegante
  con estado `sad` ("Ahora mismo no puedo responder. Prueba la búsqueda.").
- `Cache-Control: no-store` en respuestas; nada de IA en `gh-pages`.

## 6. Lo que NO se hará

- Clave en `PUBLIC_*`, `VITE_*`, HTML o JS cliente.
- Bypass del paywall por ningún camino (frontend, API ni modelo).
- Memoria conversacional con contenido premium.
- Llamadas directas del navegador al proveedor.
