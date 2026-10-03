import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../src/content/guias/', import.meta.url));
const archivos = [];
const ejecutar = process.argv.includes('--ejecutar');
const remoto = process.argv.includes('--remote');

async function recorrer(directorio) {
  for (const nombre of await readdir(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, nombre.name);
    if (nombre.isDirectory()) await recorrer(ruta);
    else if (nombre.name.endsWith('.md')) archivos.push(ruta);
  }
}

function analizarFrontmatter(texto) {
  const coincidencia = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!coincidencia) throw new Error('Frontmatter inválido.');
  const datos = Object.fromEntries(coincidencia[1].split('\n').map((linea) => {
    const separador = linea.indexOf(':');
    return [linea.slice(0, separador), linea.slice(separador + 1).trim().replace(/^"|"$/g, '')];
  }));
  return { datos, cuerpo: coincidencia[2].trim() };
}

function sql(texto) {
  return `'${String(texto ?? '').replaceAll("'", "''")}'`;
}

function convertirRegistro(archivo, texto) {
  const { datos, cuerpo } = analizarFrontmatter(texto);
  const equipo = archivo.includes('/blue/') ? 'blue' : 'red';
  const slug = `${equipo}/${basename(archivo, '.md')}`;
  return {
    slug,
    titulo: datos.titulo,
    herramienta: datos.herramienta,
    equipo,
    nivel: datos.nivel,
    acceso: datos.acceso,
    enlace_compra: datos.enlaceCompra || null,
    guia_pareja: datos.guiaPareja || null,
    fecha: datos.fecha,
    cuerpo_md: cuerpo,
    publicada: 1,
  };
}

function sentencia(registro) {
  const columnas = ['slug', 'titulo', 'herramienta', 'equipo', 'nivel', 'acceso', 'enlace_compra', 'guia_pareja', 'fecha', 'cuerpo_md', 'publicada'];
  const valores = columnas.map((columna) => registro[columna] === null ? 'NULL' : sql(registro[columna]));
  return `INSERT INTO guias (${columnas.join(', ')}) VALUES (${valores.join(', ')});`;
}

function ejecutarWrangler(archivo) {
  return new Promise((resolve, reject) => {
    const args = ['wrangler', 'd1', 'execute', 'ciberguias', '--file', archivo];
    if (remoto) args.push('--remote');
    const proceso = spawn('npx', args, { stdio: 'inherit' });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => codigo === 0 ? resolve() : reject(new Error(`Wrangler terminó con código ${codigo}.`)));
  });
}

await recorrer(raiz);
const registros = await Promise.all(archivos.map(async (archivo) => convertirRegistro(archivo, await readFile(archivo, 'utf8'))));
const sqlImportacion = `${registros.map(sentencia).join('\n')}\n`;

if (!ejecutar) {
  process.stdout.write(sqlImportacion);
} else {
  const archivoTemporal = '.guias-import.sql';
  await writeFile(archivoTemporal, sqlImportacion);
  try {
    await ejecutarWrangler(archivoTemporal);
  } finally {
    await unlink(archivoTemporal);
  }
}
