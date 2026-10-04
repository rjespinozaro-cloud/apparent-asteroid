/**
 * Acceso a la binding D1. Falla de forma explícita si el binding no existe,
 * en lugar de propagar un `undefined` difícil de diagnosticar.
 * @param {{ DB?: D1Database }} environment
 * @returns {D1Database}
 */
export function getDatabase(environment) {
  const database = environment?.DB;
  if (!database) throw new Error('La binding D1 DB no está configurada.');
  return database;
}