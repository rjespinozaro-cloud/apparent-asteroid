/**
 * Fachada del acceso a datos.
 *
 * La implementación vive en `src/lib/db/` y este archivo solo reexporta para
 * mantener una única ruta de importación (`src/lib/db.js`) en toda la aplicación.
 * No añadir lógica aquí: cada dominio tiene su propio módulo.
 */

export * from './db/index.js';