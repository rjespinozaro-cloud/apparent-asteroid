# Dirección superficie Admin (separada de la pública)

Breve shape para `/admin/*` (incluidos login e instalar). Modo **Operate**: el visitante completa tareas; escaneabilidad y consistencia por encima de expresión.

## 1. Trabajo y audiencia
- Roles `admin` y `editor` gestionando guías; solo `admin` ve usuarios, auditoría y ajustes IA.
- Contexto: trabajo repetido, pantallas densas, móvil ocasional. Éxito: encontrar, filtrar, editar y publicar sin fricción.

## 2. Resultado y prueba
- Resumen con KPIs y gráficos SVG reales desde D1; tablas filtrables; editor lado a lado.
- Prueba: `obtenerEstadisticasAdmin` con `batch()` + columnas explícitas; sin `SELECT *`; sin datos inventados (visitas solo como tarjeta "conectar").

## 3. Dirección elegida
- Tema light propio (`admin-tokens.css` + `admin.css`, `color-scheme: light`); AdminBase NO carga estilos públicos.
- Amarillo `#FACC15` solo como relleno con texto `#111827`; equipo RED `#BE123C/#FFE4E6`, BLUE `#1D4ED8/#DBEAFE`; radios 8/12px; borde 1px; sombras mínimas.
- Sidebar blanca + topbar con migas y usuario; drawer <1024px con foco atrapado y Escape.
- Anti-objetivos: nada Cyber-Premium (sin brillos, degradados animados, glitch, spotlight), nada decorativo ni infinito, sin librerías de gráficos.

## 4. Alcance y límites
- No tocar: autenticación, CSRF, sesiones, rutas, esquema D1 (sin editar migraciones).
- Movimiento solo funcional 150–200ms ease-out + `prefers-reduced-motion`.

## 5. Contraste AA verificado (texto/fondo)
| Par | Ratio | Estado |
| --- | --- | --- |
| `#111827` / `#FFFFFF` | 17.74 | AA |
| `#5B6472` / `#FFFFFF` | 5.98 | AA |
| `#5B6472` / `#F6F7F9` | 5.58 | AA |
| `#BE123C` / `#FFE4E6` | 5.24 | AA |
| `#1D4ED8` / `#DBEAFE` | 5.49 | AA |
| `#111827` / `#FACC15` | 11.58 | AA |
| `#111827` / `#FEF9C3` | 16.52 | AA |
| `#15803D` / `#FFFFFF` | 5.02 | AA (texto de éxito; `#16A34A` solo rellenos) |
| `#DC2626` / `#FFFFFF` | 4.83 | AA |
| `#B45309` / `#FFFFFF` | 5.02 | AA |
| `#FACC15` / `#FFFFFF` | 1.53 | Prohibido como texto (solo relleno) |
| `#98A2B3` / `#FFFFFF` | 2.58 | Solo decorativo, nunca texto significativo |
