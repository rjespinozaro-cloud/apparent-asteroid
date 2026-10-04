/**
 * Doble de prueba de la binding D1 implementado sobre `node:sqlite`.
 *
 * Reproduce el subconjunto de la API que usa la aplicación (`prepare`, `bind`,
 * `first`, `all`, `run`) con las mismas restricciones del motor real: los
 * parámetros se enlazan —nunca se concatenan— y el SQL se ejecuta tal cual.
 *
 * Solo para pruebas: en desarrollo y producción manda Cloudflare D1.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let contador = 0;

/** @param {string} esquema SQL del esquema base */
export function crearBaseDeDatosDePruebas(esquema) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'joanix-d1-'));
  const archivo = path.join(directorio, `prueba-${contador++}.sqlite`);
  const base = new DatabaseSync(archivo);
  base.exec(esquema);
  return envolver(base);
}

function envolver(base) {
  const preparar = (sql) => ({
    sql,
    valores: [],
    bind(...valores) {
      this.valores = valores;
      return this;
    },
    async first() {
      const fila = base.prepare(sql).get(...normalizar(this.valores)) ?? null;
      return fila ? { ...fila } : null;
    },
    async all() {
      const filas = base.prepare(sql).all(...normalizar(this.valores));
      return { results: filas.map((fila) => ({ ...fila })), success: true };
    },
    async run() {
      const resultado = base.prepare(sql).run(...normalizar(this.valores));
      return {
        success: true,
        meta: { changes: Number(resultado.changes), last_row_id: Number(resultado.lastInsertRowid) },
      };
    },
  });

  return {
    prepare: preparar,
    batch: async (sentencias) => Promise.all(sentencias.map((sentencia) => sentencia.run())),
    exec: async (sql) => base.exec(sql),
    dump: async () => JSON.stringify([]),
    close: () => base.close(),
  };
}

/** node:sqlite solo acepta null, number, bigint, string y Uint8Array. */
function normalizar(valores) {
  return valores.map((valor) => {
    if (valor === undefined) return null;
    if (typeof valor === 'boolean') return valor ? 1 : 0;
    return valor;
  });
}