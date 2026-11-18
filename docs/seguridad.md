# Revisión de seguridad

Pedido de la responsable (18/11/2026): revisar seguido las alertas de seguridad y aplicar los
parches que nos tocan. Hay tres capas.

## 1. Dependabot (`.github/dependabot.yml`)

- Abre PRs solo cuando una librería nuestra tiene un aviso de seguridad con arreglo. Los cambios
  de versión comunes siguen siendo a mano.
- La imagen de Node de la API (`apps/api/Dockerfile`) recibe actualizaciones dentro de la 24.
- Todo espera 7 días desde que se publica la versión, como `minimumReleaseAge`.
- Hay que tenerlo activado en GitHub: Settings → Code security → Dependabot alerts y Dependabot
  security updates.

## 2. Revisión diaria en GitHub Actions (`.github/workflows/seguridad.yml`)

- Todos los días corre `pnpm audit` y `scripts/node-parches.mjs`. Este último avisa si salió una
  Node 24 con parches de seguridad más nueva que la de la imagen.
- Si algo falla, GitHub manda un mail. También se puede correr a mano desde Actions.

## 3. Análisis de lunes, miércoles y viernes

- Es una tarea programada de Claude Code que corre a las 7:13 de Buenos Aires.
- Lee las alertas recientes: CISA KEV, avisos de Node.js, avisos de GitHub de nuestras
  dependencias y noticias de fallas graves.
- Decide si alguna nos afecta y por qué, mirando el stack: Node en Cloud Run detrás del TLS de
  Google, Hono, Postgres, Firebase Hosting y la web estática con Preact.
- Si hay algo que arreglar, lo arregla en un PR con las pruebas. Si CI pasa, lo mergea y despliega
  (API y después web, con la fila en `docs/versiones.md`).
- También mergea los PRs de Dependabot que estén en verde.
- Deja un resumen corto. Si no hay nada, lo dice en una línea.
- Nunca cambia topes, alcance de mainnet ni el esquema de derivación. Nunca agrega dependencias
  criptográficas. Si un arreglo pide algo de eso, frena y pregunta.
