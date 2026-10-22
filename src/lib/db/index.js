/**
 * Punto único de acceso a D1.
 *
 * La lógica de cada dominio vive en su propio módulo (`guias`, `usuarios`,
 * `auditoria`, `ia`) y se reexporta aquí para que el resto del proyecto
 * import siempre desde `../lib/db.js`.
 */

export { getDatabase } from './conexion.js';

export {
  actualizarGuia,
  buscarGuias,
  cambiarDestacadaGuia,
  cambiarPublicacionGuia,
  contarGuias,
  contarGuiasPublicadas,
  crearGuia,
  eliminarGuia,
  existeHerramientaPublicada,
  guiasRelacionadas,
  guiasVecinas,
  listarGuias,
  listarGuiasAdmin,
  listarGuiasCamino,
  listarGuiasDeHerramienta,
  listarGuiasPublicadas,
  listarHerramientasAdmin,
  listarHerramientasPublicadas,
  listarSlugsGuiasPago,
  listarSlugsGuiasPublicadas,
  listarUltimasGuias,
  obtenerEstadisticasAdmin,
  obtenerGuiaPorId,
  obtenerGuiaPorSlug,
} from './guias.js';

export {
  listarGuiasDestacadas,
  listarHerramientasDestacadas,
  listarRutas,
  listarRutasConTipologia,
  obtenerRutaPorSlug,
  obtenerTipologiaRuta,
} from './rutas.js';

export { listarHerramientasPlaneta, listarRutasPorHerramienta } from './perfil.js';

export {
  actualizarPasswordUsuario,
  cambiarEstadoUsuario,
  cambiarRolUsuario,
  contarAdminsActivos,
  contarUsuarios,
  contarUsuariosActivos,
  crearUsuario,
  eliminarSesionesUsuario,
  eliminarUsuario,
  listarUsuarios,
  obtenerUsuarioPorId,
  obtenerUsuarioPorNombre,
  purgarSesionesCaducadas,
} from './usuarios.js';

export {
  ACCIONES,
  listarAuditoria,
  listarFacetasAuditoria,
  registrarAuditoria,
  ultimasAcciones,
} from './auditoria.js';

export {
  borrarApiKeyCifrada,
  consumoMensualIa,
  guardarAjustesIa,
  guardarApiKeyCifrada,
  guardarHistorialPrompt,
  listarHistorialPrompt,
  obtenerAjustesIa,
  registrarUsoIa,
} from './ia.js';

export {
  concederAccesoGuia,
  cuentaTieneAccesoGuia,
  listarAccesosCuenta,
  listarComprasAdmin,
  metricasVentasAdmin,
  registrarCompra,
  revocarAccesoGuia,
} from './compras.js';

export {
  anonimizarCuenta,
  buscarCuentaPorEmail,
  cambiarEstadoCuenta,
  crearCuenta,
  obtenerCuentaPorId,
} from './cuentas.js';

export {
  desmarcarGuiaCompletada,
  esFavorito,
  esGuiaCompletada,
  guardarProgresoRuta,
  listarFavoritosUsuario,
  listarGuiasCompletadas,
  marcarGuiaCompletada,
  obtenerProgresoRuta,
  toggleFavorito,
} from './alumno.js';

export {
  obtenerResumenMetricas,
  registrarVisita,
} from './metricas.js';