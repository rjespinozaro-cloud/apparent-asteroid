# Progreso local del perfil (v3)

Documento de la fase 3 del perfil: niveles calculados, progreso de guías y
modo ejemplo. No hay cuentas ni endpoint: todo se guarda en el navegador.

## Qué calcula el nivel

`nivelHerramienta` (`src/lib/perfil.js`) devuelve un entero de 0 a 100 con
estas fuentes y pesos:

| Fuente | Peso | Datos |
|---|---:|---|
| Guías completadas | 50 % | `completadas` / `publicadas` |
| Prácticas | 20 % | `completadas` / `disponibles` |
| Examen | 20 % | `nota` de 0 a 100 |
| Juegos | 10 % | `completadas` / `disponibles` |

Reglas:

- Una fuente **ausente** (`null`/`undefined`) no cuenta: su peso se reparte
  entre las fuentes disponibles. Por eso hoy, con solo guías, el nivel es
  `completadas / publicadas × 100`.
- Una fuente **presente** con cero actividad sí cuenta y baja la media.
- Un total de cero da 0 (no 100), y los valores se acotan, redondean y nunca
  salen de 0-100.
- La relación guía-herramienta ya existe (`guias.herramienta`); el nivel de una
  herramienta usa sus guías publicadas.

Hoy solo se envía `guias`; prácticas, examen y juegos aparecen en la ficha como
«Próximamente» y no son enlaces.

## Dónde se guarda

- Clave: `joanix:progreso:v1` en `localStorage`.
- Formato: `{ "version": 1, "guias": [12, 34] }`.
- Solo se guardan ids de guías **publicadas** que el servidor ha renderizado.
  `/perfil/` descarta ids que ya no existen o no están publicados antes de
  calcular; la ficha de cada guía solo puede alternar su propio id.
- La clave antigua `joanix:perfil:v1` (autoevaluación con sliders) no se lee ni
  se borra. Se queda en el navegador sin efecto.
- El modo **Ver ejemplo** calcula niveles de muestra en memoria: no escribe
  nada, no toca `joanix:progreso:v1` y el botón vuelve al progreso real.

El adaptador está en `src/scripts/progreso.js`; el botón «Marcar como
completada» vive en `src/components/BotonProgreso.astro` y se carga desde la
ficha de la guía (`src/scripts/guia-progreso.js`).

## Límite de seguridad (importante)

`localStorage` es editable por la persona usuaria desde DevTools. Este progreso
**no es una prueba de identidad ni de aprovechamiento**:

- No se debe usar para insignias, certificados, ventajas de pago ni ningún
  reconocimiento con valor.
- Cuando existan cuentas de comprador y validación en servidor, el mismo
  validador (`nivelHerramienta`) podrá calcular el nivel con datos de D1; el
  progreso local quedará como caché o se migrará explícitamente.
- Cualquier cambio de formato debe subir la versión de la clave y mantener la
  lectura tolerante a datos inválidos; nunca confiar en el cliente.

## Datos y consultas

- `listarGuiasPublicadasParaPerfil` (`src/lib/db/perfil.js`): id, slug y título
  de las guías publicadas agrupadas por herramienta; no trae `cuerpo_md`.
- `listarRutasPorHerramienta`: todas las rutas publicadas que contienen guías
  de la herramienta, en orden editorial.
- No hay migración nueva para esta fase.
