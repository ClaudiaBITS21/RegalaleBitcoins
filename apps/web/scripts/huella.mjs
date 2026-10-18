// Huella de una versión del sitio: el sha256 de cada archivo publicado y, de todo eso, una sola
// huella. Cualquiera puede rehacerla: clonar el repo en el commit de la versión, compilar con
// `pnpm build:mainnet` y comparar. Escribe <dir>/version.json y lo muestra.
//   node scripts/huella.mjs dist-mainnet
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dir = process.argv[2] ?? 'dist-mainnet';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dir)
  .map((p) => relative(dir, p).split(sep).join('/'))
  .filter((p) => p !== 'version.json')
  .sort();
const archivos = Object.fromEntries(files.map((p) => [p, sha(readFileSync(join(dir, p)))]));
// Mismo formato que `sha256sum`, así se puede comparar con herramientas comunes.
const listado = files.map((p) => `${archivos[p]}  ${p}\n`).join('');
let commit = process.env.GIT_COMMIT ?? 'desconocido';
try {
  commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  // Sin git (por ejemplo, desde un .zip): queda el valor de GIT_COMMIT.
}
const version = { commit, huella: sha(listado), herramienta: archivos['herramienta-sin-conexion.html'] ?? null, archivos };
writeFileSync(join(dir, 'version.json'), `${JSON.stringify(version, null, 2)}\n`);
console.log(`Huella: ${version.huella}\nCommit: ${commit}\nHerramienta sin conexión: ${version.herramienta}`);
