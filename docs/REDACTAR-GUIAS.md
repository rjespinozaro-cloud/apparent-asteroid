# Redactar y publicar una guía

Cómo se escribe, se valida y se publica una guía en JOANIX. Todo lo que el
panel valida en el servidor está aquí; si una regla no aparece en esta página,
no existe.

## 1. Las dos familias

| | RED (ofensiva) | BLUE (defensiva) |
|---|---|---|
| Enfoque | Reconocimiento, enumeración y explotación **con autorización explícita** | Detección, validación y endurecimiento |
| Lectura | El adelanto es público; el resto va en el PDF | Guía completa y abierta |
| Regla del contenido | Como mucho **introducción + primer paso** (6 000 caracteres) | Sin límite práctico (120 000 caracteres) |

El aviso legal y el pie de cada página repiten que la práctica es solo en
laboratorios propios o con autorización expresa. No es un texto decorativo:
es la diferencia entre una guía útil y un problema.

## 2. Los campos

| Campo | Regla | Ejemplo |
|---|---|---|
| Título | 3–160 caracteres | `Nmap básico: descubrir hosts del laboratorio` |
| Slug | `equipo/nombre`, minúsculas, números y guiones; `/` separa | `red/nmap-basico` |
| Equipo | `blue` o `red` | `red` |
| Nivel | `basico`, `intermedio` o `avanzado` | `basico` |
| Acceso | `gratis` o `pago` | `gratis` |
| Herramienta | 2–40 caracteres en minúsculas | `nmap` |
| Fecha | `AAAA-MM-DD` | `2026-10-01` |
| Guía pareja | Slug de la guía del otro equipo | `blue/detectar-escaneo-nmap` |
| Destacada | Casilla del catálogo | ✓ |
| Contenido | Markdown | ver abajo |

El **tiempo de lectura** no se escribe: se calcula al guardar. El **slug** es
único: si ya existe, el editor lo rechaza.

## 3. El cuerpo en Markdown

```markdown
## Objetivo

Qué va a conseguir el lector.

## 1. Primer paso

Comandos verificables, con su salida esperada.

:::roja Qué consigue el atacante
Qué obtiene quien ejecuta la técnica.
:::

:::azul Cómo se detecta o se evita
La lectura defensiva equivalente.
:::
```

Convenciones:

- **Encabezados `##` y `###`** generan el índice de la guía y las anclas.
  Los pasos se numeran: `## 1. …`.
- **Notas de equipo** con `:::roja` y `:::azul`, cerradas con `:::`. Se
  renderizan como un aviso con su color de equipo. Sin la línea de cierre, el
  bloque se queda literal y se ve el fallo (a propósito).
- **Bloques de código** con ``` y el lenguaje cuando lo hay: se copian con un
  botón y se resaltan.
- **El HTML sucio está desactivado.** Si necesitas una etiqueta, no la
  escribas: se escapará y se verá en pantalla.
- **Los enlaces se sanean**: solo `https`, `http`, `mailto`, `tel`, `#` y
  rutas internas. Un `javascript:` se convierte en `#`.

## 4. El corte de la vista previa

En una guía de pago, el servidor **nunca** envía el cuerpo completo: se
renderiza solo el adelanto.

- Si el cuerpo tiene varios `##`, el adelanto es la introducción y la primera
  sección.
- Si no tiene ninguno, se corta por longitud (con un mínimo y un máximo
  garantizados).

Por eso el editor **rechaza** una guía RED de pago con más de un paso: el
resto del documento no cabe en la vista previa, y guardarlo daría la falsa
impresión de que se puede leer entero en la web.

## 5. Publicar

1. **Guardar** valida y escribe. No cambia el estado de publicación.
2. **Publicar** es un botón aparte. Publicar exige enlace de compra en las
   guías de pago.
3. **Despublicar** la saca del portal, pero **no** borra la guía ni sus
   accesos comprados.

Guardar una guía ya publicada **no** la despublica: la publicación es un
estado aparte.

## 6. Activar un nodo del camino

`/rutas/` no es un menú manual: el temario está en `src/data/camino.js` y cada
nodo se activa solo cuando existe una guía real publicada que lo cubra.

```js
{ id: 'blue-deteccion', tramo: 'blue', nivel: 'basico', titulo: 'Detección de escaneo',
  cobertura: { equipo: 'blue', herramienta: 'nmap', nivel: 'basico' } }
```

La cobertura se cumple con el **equipo, la herramienta y el nivel** de la
guía. `equipo: null` (tronco común) casa con cualquier equipo. Publicar una
guía con esos valores activa su nodo sin tocar código.

Los nodos **Purple** no se activan así: nacen de parejas reales RED+BLUE, por
el campo `guia_pareja` o por coincidir en herramienta. Es la forma que tiene
el catálogo de mostrar «el mismo escenario, dos lecturas».

## 7. Guías de pago

Además de lo anterior:

| Campo | Regla |
|---|---|
| Precio | Número con hasta dos decimales (`9,90` o `9.90`). Vacío = sin precio |
| Moneda | Código ISO de tres letras (`EUR`) |
| Pasarela | `stripe`, `lemonsqueezy`, `polar` o `manual` |
| Enlace de compra | El **checkout de verdad** de la pasarela: `buy.stripe.com` para Stripe, `*.lemonsqueezy.com`, `polar.sh`. El pago manual admite una página de instrucciones propia |

Un enlace a un panel del proveedor (por ejemplo `dashboard.stripe.com`) **no
vale** como checkout y el panel lo rechaza.

### La tienda está apagada por defecto

Con `TIENDA_ACTIVA=false` (el valor por defecto) el portal **no** muestra
precios, ni botones de comprar, ni la página `/comprar/<slug>/`, ni la sección
de contenido de pago del aviso legal. Las guías de pago se presentan como una
vista previa con la versión completa todavía no disponible.

Encenderla es cosa de quien despliega: `TIENDA_ACTIVA=true` en el Worker, o
`PUBLIC_TIENDA_ACTIVA=true` en el entorno del build estático. Aun encendida,
el flujo de cobro **no está implementado** (no hay webhook, ni entrega, ni
correo): ver
[docs/AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md](AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md).

## 8. Errores frecuentes

| Mensaje | Causa |
|---|---|
| «El slug solo puede usar minúsculas, números, guiones y separadores de ruta» | Mayúsculas, espacios o `_` en el slug |
| «Ya existe una guía con ese slug» | El slug está en uso por otra guía |
| «Las guías RED solo pueden guardar la introducción y el primer paso» | Hay más de un paso `##` numerado en una guía RED de pago |
| «El adelanto RED no puede superar 6000 caracteres» | La introducción y el primer paso son demasiado largos |
| «Una guía de pago necesita un enlace de compra» | Acceso `pago` sin enlace. En una guía heredada sin checkout se puede guardar, pero no publicar |
| «La guía pareja no puede ser ella misma» | `guia_pareja` apunta a su propio slug |

Los errores llegan al editor **por campo**: el servidor devuelve
`[{ campo, mensaje }]` y el formulario los muestra junto al campo que falla.

## 9. Antes de dar por buena una guía

- [ ] El título dice lo que hace la guía, no la herramienta.
- [ ] El comando del ejemplo se puede copiar y pegar tal cual.
- [ ] La guía dice en qué laboratorio se ejecuta y con qué autorización.
- [ ] La nota `:::roja` y la `:::azul` describen el mismo hecho desde los dos
      lados.
- [ ] El tiempo de lectura que muestra la cabecera es razonable.
- [ ] Si es RED y de pago, el cuerpo es solo el adelanto.
- [ ] La guía pareja (si la tiene) apunta a la guía del otro equipo.
- [ ] La previsualización en el editor se lee bien.
- [ ] Con la tienda apagada, la página pública no promete nada que no exista.

## 10. El asistente IA

El bloque de abajo del editor escribe con el proveedor configurado en
`/admin/ajustes-ia/`. Es una ayuda de redacción, no una fuente de verdad:

- Todo lo que propose hay que leerlo y corregirlo antes de guardar.
- El consumo (llamadas y tokens) está en `/admin/ajustes-ia/`, con un tope
  mensual configurable.
- La clave del proveedor se cifra con `MASTER_KEY` y solo se guardan los
  últimos cuatro caracteres en claro.
- El modelo por defecto **no inventa comandos**: es parte del prompt de
  sistema, y sigue siendo responsabilidad de quien publica.
