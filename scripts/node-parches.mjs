// Revisa si salió una versión de Node 24 con parches de seguridad más nueva que la de la imagen de
// la API (apps/api/Dockerfile). Sale con error si hace falta actualizar; usa red (nodejs.org).
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../apps/api/Dockerfile', import.meta.url), 'utf8');
const match = /^FROM node:(\d+)\.(\d+)\.(\d+)-slim/m.exec(dockerfile);
if (match === null) {
  console.error('El Dockerfile de la API no fija una versión exacta de Node (node:X.Y.Z-slim).');
  process.exit(1);
}
const actual = match.slice(1, 4).map(Number);
const comparar = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const respuesta = await fetch('https://nodejs.org/dist/index.json');
if (!respuesta.ok) throw new Error(`nodejs.org respondió ${respuesta.status}`);
const versiones = (await respuesta.json())
  .map((v) => ({ numero: v.version.slice(1).split('.').map(Number), seguridad: v.security === true, texto: v.version }))
  .filter((v) => v.numero[0] === actual[0] && comparar(v.numero, actual) > 0);

const conParches = versiones.filter((v) => v.seguridad);
if (conParches.length > 0) {
  const ultima = versiones.sort((a, b) => comparar(b.numero, a.numero))[0];
  console.error(`Node ${actual.join('.')} tiene parches de seguridad pendientes (${conParches.map((v) => v.texto).join(', ')}). Actualizar a ${ultima.texto}.`);
  process.exit(1);
}
console.log(`Node ${actual.join('.')}: sin parches de seguridad pendientes en la ${actual[0]}.`);
