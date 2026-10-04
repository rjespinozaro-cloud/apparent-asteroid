/**
 * Vocabulario del dominio. Centraliza las etiquetas visibles para que la interfaz
 * no disperse literales por los componentes y los dos equipos se nombren igual.
 */

export const EQUIPOS = {
  blue: {
    clave: 'blue',
    nombre: 'BLUE',
    rol: 'Defensa',
    descripcion: 'Detectar, monitorizar y endurecer. Del lado defensivo.',
  },
  red: {
    clave: 'red',
    nombre: 'RED',
    rol: 'Ofensiva',
    descripcion: 'Reconocer, enumerar y explotar. Con autorización explícita.',
  },
};

export const NIVELES = {
  basico: { clave: 'basico', nombre: 'Básico', peso: 1 },
  intermedio: { clave: 'intermedio', nombre: 'Intermedio', peso: 2 },
  avanzado: { clave: 'avanzado', nombre: 'Avanzado', peso: 3 },
};

export const ACCESOS = {
  gratis: { clave: 'gratis', nombre: 'Gratis' },
  pago: { clave: 'pago', nombre: 'PDF de pago' },
};

export const ORDENES_GUIAS = {
  fecha: { clave: 'fecha', nombre: 'Más recientes' },
  actualizado: { clave: 'actualizado', nombre: 'Última edición' },
  titulo: { clave: 'titulo', nombre: 'Título A-Z' },
};

/** Etiqueta de equipo a partir del valor de la base de datos. */
export function nombreEquipo(equipo) {
  return EQUIPOS[equipo]?.nombre ?? '—';
}

/** Etiqueta de nivel a partir del valor de la base de datos. */
export function nombreNivel(nivel) {
  return NIVELES[nivel]?.nombre ?? '—';
}

/** Etiqueta de acceso a partir del valor de la base de datos. */
export function nombreAcceso(acceso) {
  return ACCESOS[acceso]?.nombre ?? '—';
}

/** Clase CSS del color de equipo (`red`/`blue`/`neutro`). */
export function claseEquipo(equipo) {
  return equipo === 'red' || equipo === 'blue' ? equipo : 'neutro';
}

/** Nombre legible de una herramienta a partir de su slug: `burp-suite` → `Burp Suite`. */
export function nombreHerramienta(herramienta) {
  const valor = String(herramienta ?? '').trim();
  if (!valor) return '—';
  return valor
    .split('-')
    .map((parte) => (parte.length <= 2 ? parte : `${parte[0].toUpperCase()}${parte.slice(1)}`))
    .join(' ');
}