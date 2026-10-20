/**
 * Métricas de visitas nativas y privadas en Cloudflare D1.
 * Agregación diaria por tipo de página y slug. Cero IPs, cero cookies, cero GDPR/rastreo.
 */

/**
 * Incrementa el contador de visitas de una página para la fecha actual.
 * @param {D1Database} database
 * @param {{ rutaTipo: 'portada'|'catalogo'|'guia'|'ruta'|'herramienta'|'buscar', slug?: string }} datos
 */
export async function registrarVisita(database, { rutaTipo, slug = '' }) {
  const hoy = new Date().toISOString().slice(0, 10);
  await database
    .prepare(
      `INSERT INTO metricas_visitas (fecha, ruta_tipo, slug, visitas)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (fecha, ruta_tipo, slug) DO UPDATE SET
         visitas = visitas + 1`,
    )
    .bind(hoy, rutaTipo, slug)
    .run();
}

/**
 * Obtiene el resumen de visitas de los últimos N días para los gráficos del dashboard de admin.
 * @param {D1Database} database
 * @param {number} dias
 * @returns {Promise<{ porFecha: Array<{fecha: string, total: number}>, porTipo: Array<{ruta_tipo: string, total: number}>, topGuias: Array<{slug: string, total: number}>, totalVisitas: number }>}
 */
export async function obtenerResumenMetricas(database, dias = 30) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [porFecha, porTipo, topGuias, totalGeneral] = await database.batch([
    database.prepare(
      `SELECT fecha, SUM(visitas) AS total
       FROM metricas_visitas
       WHERE fecha >= ?
       GROUP BY fecha
       ORDER BY fecha ASC`,
    ).bind(desde),
    database.prepare(
      `SELECT ruta_tipo, SUM(visitas) AS total
       FROM metricas_visitas
       WHERE fecha >= ?
       GROUP BY ruta_tipo
       ORDER BY total DESC`,
    ).bind(desde),
    database.prepare(
      `SELECT slug, SUM(visitas) AS total
       FROM metricas_visitas
       WHERE fecha >= ? AND ruta_tipo = 'guia' AND slug != ''
       GROUP BY slug
       ORDER BY total DESC
       LIMIT 5`,
    ).bind(desde),
    database.prepare(
      `SELECT COALESCE(SUM(visitas), 0) AS total
       FROM metricas_visitas
       WHERE fecha >= ?`,
    ).bind(desde),
  ]);

  return {
    porFecha: (porFecha.results ?? []).map((r) => ({ fecha: String(r.fecha), total: Number(r.total ?? 0) })),
    porTipo: (porTipo.results ?? []).map((r) => ({ ruta_tipo: String(r.ruta_tipo), total: Number(r.total ?? 0) })),
    topGuias: (topGuias.results ?? []).map((r) => ({ slug: String(r.slug), total: Number(r.total ?? 0) })),
    totalVisitas: Number(totalGeneral.results?.[0]?.total ?? 0),
  };
}
