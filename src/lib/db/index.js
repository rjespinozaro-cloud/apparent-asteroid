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
  listarGuiasDeHerramienta,
  listarGuiasPublicadas,
  listarHerramientasAdmin,
  listarHerramientasPublicadas,
  listarUltimasGuias,
  obtenerEstadisticasAdmin,
  obtenerGuiaPorId,
  obtenerGuiaPorSlug,
} from './guias.js';

export {
  listarGuiasDestacadas,
  listarHerramientasDestacadas,
  listarRutas,
  obtenerRutaPorSlug,
} from './rutas.js';

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