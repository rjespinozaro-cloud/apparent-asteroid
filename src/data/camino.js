/**
 * Camino de leyendas (/rutas/): ÚNICA fuente de verdad del sendero.
 *
 * - `CURRICULO` declara los nodos objetivo en orden de lectura (tronco →
 *   por nivel: RED, BLUE y Purple → cierre). Es temario, no contenido: un nodo
 *   solo pasa a «Disponible» cuando existe al menos una guía real publicada
 *   que lo cubre (ver `cobertura`).
 * - `construirCamino(guias, base)` cruza ese temario con las guías publicadas
 *   y devuelve el array de nodos que alimenta tanto el sendero visual como el
 *   listado textual de respaldo. Publicar una guía con la `cobertura`
 *   correspondiente activa su nodo sin tocar código.
 * - Los nodos Purple salen de parejas reales RED+BLUE: primero por el enlace
 *   explícito `guia_pareja`, si no por coincidir en herramienta.
 *
 * Convención de `cobertura`: { equipo, herramienta, nivel }. `equipo: null`
 * (tronco) casa con cualquier equipo. Los slugs de herramienta de nodos aún
 * sin guía son canónicos y están documentados en docs/informe-rutas-camino.md:
 * una guía futura con esos valores activa el nodo sola.
 */
import { descripcionDesdeMarkdown, dividirPreview } from '../lib/utils/texto.js';
import { nombreAcceso, nombreHerramienta, nombreNivel } from '../lib/vocabulario.js';

/** Tramos del sendero, en orden visual. */
export const TRAMOS = {
  tronco: { clave: 'tronco', nombre: 'Fundamentos' },
  red: { clave: 'red', nombre: 'RED' },
  blue: { clave: 'blue', nombre: 'BLUE' },
  purple: { clave: 'purple', nombre: 'Purple' },
  cierre: { clave: 'cierre', nombre: 'Especialización' },
};

/** Niveles en orden de lectura del sendero. */
export const NIVELES_ORDEN = ['tronco', 'basico', 'intermedio', 'avanzado', 'cierre'];

/**
 * @typedef {{
 *   id: string,
 *   tramo: 'tronco'|'red'|'blue'|'purple'|'cierre',
 *   nivel: 'tronco'|'basico'|'intermedio'|'avanzado'|'cierre',
 *   titulo: string,
 *   descripcion: string,
 *   icono: string,
 *   cobertura: { equipo: 'red'|'blue'|null, herramienta: string, nivel: string } | null,
 *   parejaHerramienta?: string,
 *   rutaSlug?: string,
 * }} NodoCurriculo
 */

export const CURRICULO = [
  // Tronco común -----------------------------------------------------------
  { id: 'fund-redes', tramo: 'tronco', nivel: 'tronco', titulo: 'Redes', descripcion: 'OSI y TCP/IP, subneteo, DNS/DHCP/HTTP y lectura básica con Wireshark.', icono: 'redes', cobertura: { equipo: null, herramienta: 'redes', nivel: 'basico' } },
  { id: 'fund-linux', tramo: 'tronco', nivel: 'tronco', titulo: 'Linux', descripcion: 'Shell, permisos, procesos y servicios, logs, línea de comandos y SSH.', icono: 'terminal', cobertura: { equipo: null, herramienta: 'linux', nivel: 'basico' } },
  { id: 'fund-windows', tramo: 'tronco', nivel: 'tronco', titulo: 'Windows y Active Directory', descripcion: 'Dominios, OU y GPO, PowerShell básico y Visor de eventos.', icono: 'ventana', cobertura: { equipo: null, herramienta: 'windows', nivel: 'basico' } },
  { id: 'fund-seguridad', tramo: 'tronco', nivel: 'tronco', titulo: 'Seguridad base', descripcion: 'Tríada CIA, Kill Chain, intro a MITRE ATT&CK y criptografía básica.', icono: 'escudo', cobertura: { equipo: null, herramienta: 'seguridad', nivel: 'basico' } },
  // RED · básico ------------------------------------------------------------
  { id: 'red-osint', tramo: 'red', nivel: 'basico', titulo: 'Reconocimiento pasivo (OSINT)', descripcion: 'WHOIS, Google dorking y huella pública. Sin tocar el objetivo.', icono: 'ojo', cobertura: { equipo: 'red', herramienta: 'osint', nivel: 'basico' } },
  { id: 'red-nmap', tramo: 'red', nivel: 'basico', titulo: 'Reconocimiento activo (Nmap)', descripcion: 'Descubrimiento de hosts y escaneo de puertos en tu laboratorio.', icono: 'radar', cobertura: { equipo: 'red', herramienta: 'nmap', nivel: 'basico' } },
  { id: 'red-enum', tramo: 'red', nivel: 'basico', titulo: 'Enumeración de servicios', descripcion: 'FTP, SSH, SMB y HTTP: versiones, banners y superficie expuesta.', icono: 'lista', cobertura: { equipo: 'red', herramienta: 'enumeracion', nivel: 'basico' } },
  // BLUE · básico -----------------------------------------------------------
  { id: 'blue-logs', tramo: 'blue', nivel: 'basico', titulo: 'Lectura de logs', descripcion: 'Análisis de registros en Linux y Windows.', icono: 'registros', cobertura: { equipo: 'blue', herramienta: 'logs', nivel: 'basico' } },
  { id: 'blue-monitoreo', tramo: 'blue', nivel: 'basico', titulo: 'Monitoreo de red', descripcion: 'Wireshark y tcpdump para ver qué cruza tu red.', icono: 'actividad', cobertura: { equipo: 'blue', herramienta: 'monitoreo', nivel: 'basico' } },
  { id: 'blue-deteccion', tramo: 'blue', nivel: 'basico', titulo: 'Detección de escaneo', descripcion: 'Detectar un Nmap en tus registros y responder.', icono: 'campana', cobertura: { equipo: 'blue', herramienta: 'nmap', nivel: 'basico' } },
  { id: 'blue-siem', tramo: 'blue', nivel: 'basico', titulo: 'Fundamentos de SIEM', descripcion: 'Qué es un SIEM y para qué sirve.', icono: 'panel', cobertura: { equipo: 'blue', herramienta: 'siem', nivel: 'basico' } },
  // Purple · básico (pareja real Nmap) ---------------------------------------
  { id: 'purple-nmap', tramo: 'purple', nivel: 'basico', titulo: 'Nmap: mismo escenario, dos lecturas', descripcion: 'Mismo escaneo, dos lecturas: ataque autorizado en tu laboratorio y su detección defensiva.', icono: 'enlace', cobertura: null, parejaHerramienta: 'nmap', rutaSlug: 'reconocimiento-nmap' },
  // RED · intermedio ----------------------------------------------------------
  { id: 'red-web-enum', tramo: 'red', nivel: 'intermedio', titulo: 'Enumeración web', descripcion: 'Directorios, tecnologías y subdominios.', icono: 'globo', cobertura: { equipo: 'red', herramienta: 'web', nivel: 'intermedio' } },
  { id: 'red-owasp', tramo: 'red', nivel: 'intermedio', titulo: 'OWASP Top 10 básico', descripcion: 'Inyección, XSS y fallos de autenticación en laboratorio.', icono: 'bicho', cobertura: { equipo: 'red', herramienta: 'owasp', nivel: 'intermedio' } },
  { id: 'red-servicios', tramo: 'red', nivel: 'intermedio', titulo: 'Servicios mal configurados', descripcion: 'Explotación de configuraciones por defecto e inseguras.', icono: 'engranaje', cobertura: { equipo: 'red', herramienta: 'servicios', nivel: 'intermedio' } },
  { id: 'red-metasploit', tramo: 'red', nivel: 'intermedio', titulo: 'Metasploit intro', descripcion: 'Conceptos y módulos básicos del framework.', icono: 'caja', cobertura: { equipo: 'red', herramienta: 'metasploit', nivel: 'intermedio' } },
  { id: 'red-auth', tramo: 'red', nivel: 'intermedio', titulo: 'Ataques a autenticación', descripcion: 'Fuerza bruta controlada y credenciales por defecto.', icono: 'llave', cobertura: { equipo: 'red', herramienta: 'fuerza-bruta', nivel: 'intermedio' } },
  // BLUE · intermedio ---------------------------------------------------------
  { id: 'blue-wazuh', tramo: 'blue', nivel: 'intermedio', titulo: 'SIEM con Wazuh', descripcion: 'Configuración y uso operativo de Wazuh.', icono: 'panel', cobertura: { equipo: 'blue', herramienta: 'wazuh', nivel: 'intermedio' } },
  { id: 'blue-fuerza-bruta', tramo: 'blue', nivel: 'intermedio', titulo: 'Fuerza bruta y accesos anómalos', descripcion: 'Detección de accesos anómalos y fuerza bruta.', icono: 'campana', cobertura: { equipo: 'blue', herramienta: 'fuerza-bruta', nivel: 'intermedio' } },
  { id: 'blue-hardening', tramo: 'blue', nivel: 'intermedio', titulo: 'Hardening básico', descripcion: 'Endurecer Linux y Windows paso a paso.', icono: 'candado', cobertura: { equipo: 'blue', herramienta: 'hardening', nivel: 'intermedio' } },
  { id: 'blue-parches', tramo: 'blue', nivel: 'intermedio', titulo: 'Parches y superficie de ataque', descripcion: 'Gestión de parches y reducción de exposición.', icono: 'llave-inglesa', cobertura: { equipo: 'blue', herramienta: 'parches', nivel: 'intermedio' } },
  // Purple · intermedio (candidata: fuerza bruta SSH) --------------------------
  { id: 'purple-fuerza-bruta', tramo: 'purple', nivel: 'intermedio', titulo: 'Fuerza bruta SSH: mismo escenario, dos lecturas', descripcion: 'Ataque de fuerza bruta controlado frente a su detección y bloqueo.', icono: 'enlace', cobertura: null, parejaHerramienta: 'fuerza-bruta-ssh' },
  // RED · avanzado --------------------------------------------------------------
  { id: 'red-postex', tramo: 'red', nivel: 'avanzado', titulo: 'Post-explotación', descripcion: 'Escalación de privilegios en Linux y Windows.', icono: 'flecha-subida', cobertura: { equipo: 'red', herramienta: 'postexplotacion', nivel: 'avanzado' } },
  { id: 'red-pivoting', tramo: 'red', nivel: 'avanzado', titulo: 'Pivoting y movimiento lateral', descripcion: 'Saltar de un host comprometido a la red interna.', icono: 'flechas', cobertura: { equipo: 'red', herramienta: 'pivoting', nivel: 'avanzado' } },
  { id: 'red-ad', tramo: 'red', nivel: 'avanzado', titulo: 'Ataques a Active Directory', descripcion: 'Enumeración de AD y Kerberoasting en laboratorio.', icono: 'rejilla', cobertura: { equipo: 'red', herramienta: 'kerberoasting', nivel: 'avanzado' } },
  { id: 'red-ingsocial', tramo: 'red', nivel: 'avanzado', titulo: 'Ingeniería social', descripcion: 'Phishing simulado y pretexting, siempre con autorización.', icono: 'correo', cobertura: { equipo: 'red', herramienta: 'phishing', nivel: 'avanzado' } },
  { id: 'red-wifi', tramo: 'red', nivel: 'avanzado', titulo: 'Seguridad inalámbrica', descripcion: 'WPA2 y ataques a Wi-Fi en laboratorio propio.', icono: 'wifi', cobertura: { equipo: 'red', herramienta: 'wifi', nivel: 'avanzado' } },
  // BLUE · avanzado --------------------------------------------------------------
  { id: 'blue-hunting', tramo: 'blue', nivel: 'avanzado', titulo: 'Threat hunting', descripcion: 'Hipótesis y búsqueda proactiva de intrusos.', icono: 'diana', cobertura: { equipo: 'blue', herramienta: 'hunting', nivel: 'avanzado' } },
  { id: 'blue-ir', tramo: 'blue', nivel: 'avanzado', titulo: 'Respuesta a incidentes', descripcion: 'Triage, contención y erradicación.', icono: 'salvavidas', cobertura: { equipo: 'blue', herramienta: 'incidentes', nivel: 'avanzado' } },
  { id: 'blue-forense', tramo: 'blue', nivel: 'avanzado', titulo: 'Forense básico', descripcion: 'Línea de tiempo y artefactos principales.', icono: 'lupa', cobertura: { equipo: 'blue', herramienta: 'forense', nivel: 'avanzado' } },
  { id: 'blue-sigma', tramo: 'blue', nivel: 'avanzado', titulo: 'Sigma y YARA intro', descripcion: 'Primeras reglas de detección.', icono: 'codigo', cobertura: { equipo: 'blue', herramienta: 'sigma', nivel: 'avanzado' } },
  // Purple · avanzado (candidata: Kerberoasting) -----------------------------------
  { id: 'purple-kerberoasting', tramo: 'purple', nivel: 'avanzado', titulo: 'Kerberoasting: mismo escenario, dos lecturas', descripcion: 'Abuso de Kerberos frente a su detección en los eventos de AD.', icono: 'enlace', cobertura: null, parejaHerramienta: 'kerberoasting' },
  // Cierre -------------------------------------------------------------------------
  { id: 'cierre-especializacion', tramo: 'cierre', nivel: 'cierre', titulo: 'Especialización (Fase 2)', descripcion: 'C2, DFIR avanzado, análisis de malware, threat intel y nube. Hoja de ruta pública.', icono: 'bandera', cobertura: null },
];

/**
 * @typedef {{
 *   id: string, tramo: string, nivel: string, titulo: string, descripcion: string,
 *   icono: string, equipo: 'neutro'|'red'|'blue'|'purple',
 *   estado: 'disponible'|'proximamente', acceso: 'gratis'|'pago'|null,
 *   href: string|null, meta: string, guiaSlug: string|null,
 *   pareja: { roja: string, azul: string, tituloRoja: string, tituloAzul: string } | null,
 *   cta: string|null,
 * }} NodoCamino
 */

const PESO_NIVEL = { basico: 1, intermedio: 2, avanzado: 3 };

function normalizarBase(base) {
  return `${String(base ?? '/').replace(/\/+$/, '')}/`;
}

/** ¿Cubre esta guía publicada el criterio del nodo? */
function cubre(guia, criterio) {
  if (!criterio) return false;
  if (criterio.equipo && guia.equipo !== criterio.equipo) return false;
  if (criterio.herramienta && guia.herramienta !== criterio.herramienta) return false;
  if (criterio.nivel && guia.nivel !== criterio.nivel) return false;
  return true;
}

/**
 * Descripción pública de una guía real: en pago, SOLO la vista previa (el
 * resto bloqueado jamás sale del servidor); en gratis, el cuerpo. Siempre
 * recortada a una línea legible.
 */
function descripcionDeGuia(guia) {
  const cuerpo = String(guia?.cuerpo_md ?? '');
  const visible = guia?.acceso === 'pago' ? dividirPreview(cuerpo).preview : cuerpo;
  return descripcionDesdeMarkdown(visible, 140);
}

/**
 * Parejas reales RED+BLUE: primero por el enlace explícito `guia_pareja`
 * (ambos publicados), después agrupando por herramienta lo no emparejado.
 * @returns {Array<{ herramienta: string, roja: object, azul: object }>}
 */
export function parejasReales(guiaLista) {
  const guias = Array.isArray(guiaLista) ? guiaLista : [];
  const porSlug = new Map(guias.map((guia) => [guia.slug, guia]));
  const emparejadas = new Set();
  const parejas = [];
  for (const guia of guias) {
    if (emparejadas.has(guia.slug) || !guia.guia_pareja) continue;
    const otra = porSlug.get(guia.guia_pareja);
    if (!otra || emparejadas.has(otra.slug) || otra.equipo === guia.equipo) continue;
    const roja = guia.equipo === 'red' ? guia : otra;
    const azul = guia.equipo === 'blue' ? guia : otra;
    parejas.push({ herramienta: roja.herramienta, roja, azul });
    emparejadas.add(guia.slug);
    emparejadas.add(otra.slug);
  }
  const porHerramienta = new Map();
  for (const guia of guias) {
    if (emparejadas.has(guia.slug)) continue;
    if (!porHerramienta.has(guia.herramienta)) porHerramienta.set(guia.herramienta, { red: null, blue: null });
    const grupo = porHerramienta.get(guia.herramienta);
    if (guia.equipo === 'red' && !grupo.red) grupo.red = guia;
    if (guia.equipo === 'blue' && !grupo.blue) grupo.blue = guia;
  }
  for (const [herramienta, grupo] of porHerramienta) {
    if (grupo.red && grupo.blue) parejas.push({ herramienta, roja: grupo.red, azul: grupo.blue });
  }
  return parejas;
}

function nodoPurpleDisponible(definicion, pareja, baseUrl) {
  const destino = definicion.rutaSlug
    ? `${baseUrl}rutas/${definicion.rutaSlug}/`
    : `${baseUrl}herramientas/${pareja.herramienta}/`;
  return {
    id: definicion.id,
    tramo: 'purple',
    nivel: definicion.nivel,
    titulo: definicion.titulo,
    descripcion: definicion.descripcion,
    icono: definicion.icono,
    equipo: 'purple',
    estado: 'disponible',
    acceso: null,
    href: destino,
    meta: `RED + BLUE · ${nombreHerramienta(pareja.herramienta)}`,
    guiaSlug: null,
    pareja: { roja: pareja.roja.slug, azul: pareja.azul.slug, tituloRoja: pareja.roja.titulo, tituloAzul: pareja.azul.titulo },
    cta: definicion.rutaSlug ? 'Ver ruta' : 'Ver herramienta',
  };
}

function nodoProximamente(definicion) {
  return {
    id: definicion.id,
    tramo: definicion.tramo,
    nivel: definicion.nivel,
    titulo: definicion.titulo,
    descripcion: definicion.descripcion,
    icono: definicion.icono,
    equipo: definicion.tramo === 'purple' ? 'purple' : definicion.tramo === 'cierre' || definicion.tramo === 'tronco' ? 'neutro' : definicion.tramo,
    estado: 'proximamente',
    acceso: null,
    href: null,
    meta: definicion.tramo === 'purple' && definicion.parejaHerramienta
      ? `RED + BLUE · ${nombreHerramienta(definicion.parejaHerramienta)}`
      : TRAMOS[definicion.tramo]?.nombre ?? '',
    guiaSlug: null,
    pareja: null,
    cta: null,
  };
}

/**
 * Construye el camino cruzando el temario con las guías publicadas.
 * Función pura: mismas guías → mismos nodos. No muta `CURRICULO`.
 * @param {Array} guiaLista filas de `listarGuiasCamino`
 * @param {string} base prefijo de URLs (`/` en Workers, `/apparent-asteroid/` en Pages)
 * @returns {{ nodos: NodoCamino[], disponibles: number, total: number }}
 */
export function construirCamino(guiaLista, base = '/') {
  const baseUrl = normalizarBase(base);
  const guias = Array.isArray(guiaLista) ? guiaLista : [];
  const reclamadas = new Set();
  const parejas = parejasReales(guias);
  const parejaPorHerramienta = new Map(parejas.map((pareja) => [pareja.herramienta, pareja]));

  const nodos = CURRICULO.map((definicion) => {
    if (definicion.tramo === 'purple') {
      const pareja = definicion.parejaHerramienta ? parejaPorHerramienta.get(definicion.parejaHerramienta) : null;
      return pareja ? nodoPurpleDisponible(definicion, pareja, baseUrl) : nodoProximamente(definicion);
    }
    if (!definicion.cobertura) return nodoProximamente(definicion);
    const guia = guias.find((candidata) => !reclamadas.has(candidata.slug) && cubre(candidata, definicion.cobertura));
    if (!guia) return nodoProximamente(definicion);
    reclamadas.add(guia.slug);
    const equipo = guia.equipo === 'red' || guia.equipo === 'blue' ? guia.equipo : 'neutro';
    return {
      id: definicion.id,
      tramo: definicion.tramo,
      nivel: definicion.nivel,
      titulo: guia.titulo,
      descripcion: descripcionDeGuia(guia) || definicion.descripcion,
      icono: definicion.icono,
      equipo,
      estado: 'disponible',
      acceso: guia.acceso === 'pago' ? 'pago' : 'gratis',
      href: `${baseUrl}guias/${guia.slug}/`,
      meta: `${nombreHerramienta(guia.herramienta)} · ${nombreNivel(guia.nivel)} · ${nombreAcceso(guia.acceso)}`,
      guiaSlug: guia.slug,
      pareja: null,
      cta: 'Ver guía',
    };
  });

  // Parejas sobre herramientas no previstas en el temario: se añaden como
  // nodos Purple dinámicos al final de su nivel (nivel mayor de la pareja).
  const previstas = new Set(CURRICULO.filter((nodo) => nodo.tramo === 'purple' && nodo.parejaHerramienta).map((nodo) => nodo.parejaHerramienta));
  const dinamicas = parejas.filter((pareja) => !previstas.has(pareja.herramienta));
  for (const pareja of dinamicas) {
    const nivel = PESO_NIVEL[pareja.azul.nivel] >= PESO_NIVEL[pareja.roja.nivel] ? pareja.azul.nivel : pareja.roja.nivel;
    const nivelClave = PESO_NIVEL[nivel] ? nivel : 'basico';
    let insercion = nodos.length;
    for (let indice = nodos.length - 1; indice >= 0; indice -= 1) {
      if (nodos[indice].nivel === nivelClave) { insercion = indice + 1; break; }
    }
    nodos.splice(insercion, 0, {
      id: `purple-${pareja.herramienta}`,
      tramo: 'purple',
      nivel: nivelClave,
      titulo: `${nombreHerramienta(pareja.herramienta)}: mismo escenario, dos lecturas`,
      descripcion: 'Pareja RED+BLUE sobre la misma herramienta: ataque autorizado y defensa.',
      icono: 'enlace',
      equipo: 'purple',
      estado: 'disponible',
      acceso: null,
      href: `${baseUrl}herramientas/${pareja.herramienta}/`,
      meta: `RED + BLUE · ${nombreHerramienta(pareja.herramienta)}`,
      guiaSlug: null,
      pareja: { roja: pareja.roja.slug, azul: pareja.azul.slug, tituloRoja: pareja.roja.titulo, tituloAzul: pareja.azul.titulo },
      cta: 'Ver herramienta',
    });
  }

  return { nodos, disponibles: nodos.filter((nodo) => nodo.estado === 'disponible').length, total: nodos.length };
}
