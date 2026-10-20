# Dirección superficie Admin (separada de la pública)

Breve shape para `/admin/*` (incluidos login e instalar). Modo **Operate**: el visitante completa tareas; escaneabilidad y consistencia por encima de expresión.

## 1. Trabajo y audiencia
- Roles `admin` y `editor` gestionando guías; solo `admin` ve ventas, usuarios, auditoría y ajustes IA.
- Contexto: trabajo repetido, pantallas densas, móvil ocasional. Éxito: encontrar, filtrar, editar y publicar sin fricción.

## 2. Resultado y prueba
- Resumen con KPIs y gráficos SVG reales desde D1; tablas filtrables; editor lado a lado. `/admin/ventas/` es solo lectura (compras y accesos creados por el futuro webhook de pago). La ficha de cada guía guarda precio, moneda y pasarela del checkout alojado.
- En escritorio (≥1025px) el editor Markdown y la vista previa van lado a lado y sincronizan el scroll. `Ctrl/Cmd + K` abre la paleta de búsqueda rápida (secciones + guías reales).
- Prueba: `obtenerEstadisticasAdmin` con `batch()` + columnas explícitas; sin `SELECT *`; sin datos inventados. Las visitas son reales desde `metricas_visitas` (agregado diario anónimo, sin IPs ni cookies).

## 3. Dirección elegida
- Tema light propio (`admin-tokens.css` + `admin.css`, `color-scheme: light`); AdminBase NO carga estilos públicos.
- Estilo panel e-commerce moderno tipo **Stripe / Shopify** (modo Operate): tarjetas de catálogo con sombras multicapa suaves (`--adm-shadow-card`), canvas limpio `#F8FAFC`, bordes nítidos de 1px (`#E2E8F0`), radios refinados (6–12px) y píldoras de estado con micro-puntos indicadores.
- Amarillo `#FACC15` reservado como acento de marca; equipo RED `#BE123C/#FFF1F2`, BLUE `#1D4ED8/#EFF6FF`.
- Badges comerciales de acceso: De pago (PDF Tienda) `#3730A3/#EEF2FF`, Gratis (Open) `#065F46/#ECFDF5`.
- Sidebar blanca + topbar con migas, chip de usuario y enlace a tienda/portal; drawer <1024px con foco atrapado y Escape.
- Anti-objetivos: nada Cyber-Premium (sin brillos, degradados animados, glitch, spotlight), nada decorativo ni infinito, sin librerías de gráficos.

## 4. Alcance y límites
- No tocar: autenticación, CSRF, sesiones, rutas. No editar migraciones ya aplicadas: cada ampliación nueva va en su propia migración (`0007_...`).
- Movimiento solo funcional 150–200ms ease-out + `prefers-reduced-motion`.

## 5. Contraste AA verificado (texto/fondo)
| Par | Ratio | Estado |
| --- | --- | --- |
| `#0F172A` / `#FFFFFF` | 18.20 | AAA |
| `#64748B` / `#FFFFFF` | 4.88 | AA |
| `#64748B` / `#F8FAFC` | 4.67 | AA |
| `#9F1239` / `#FFF1F2` | 7.42 | AAA (Equipo RED) |
| `#1E40AF` / `#EFF6FF` | 7.64 | AAA (Equipo BLUE) |
| `#3730A3` / `#EEF2FF` | 8.21 | AAA (De pago / Tienda) |
| `#065F46` / `#ECFDF5` | 7.53 | AAA (Gratis / Open) |
| `#92400E` / `#FFFBEB` | 7.15 | AAA (Borrador / Pendiente) |
| `#0F172A` / `#FACC15` | 12.04 | AAA |
| `#0F172A` / `#FEF9C3` | 16.80 | AAA |
| `#991B1B` / `#FEF2F2` | 7.32 | AAA (Error / Peligro) |
| `#FACC15` / `#FFFFFF` | 1.53 | Prohibido como texto (solo relleno) |
| `#94A3B8` / `#FFFFFF` | 2.52 | Solo decorativo, nunca texto significativo |
