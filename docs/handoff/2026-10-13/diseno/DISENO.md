# Handoff de diseño — línea visual "Confeti" (13/10/2026)

Trabajado con Rodolfo en Cowork. Complementa `../HANDOFF.md` (contenido, 21 razones, tarjeta imprimible). Lo marcado **ABIERTO** se confirma con Rodolfo antes de implementar.

Prototipos de referencia en esta carpeta (formato Design de Claude: HTML con estilos inline + clase `Component` con la lógica; son referencia visual y de comportamiento, **reimplementar en Preact** con el CSS del proyecto, sin estilos inline por la CSP):

| Archivo | Qué es |
|---|---|
| `home-celular.dc.html` | Home elegida, 390 px. Incluye selector de ocasiones y abanico de 21 razones. |
| `home-compu.dc.html` | Home en compu (fluida, max 1180 px). Menú Regalar / Recibir. |
| `tarjetas-4-estilos.dc.html` | Tarjeta del regalo en 4 estilos (Cumpleaños y Bautismo). |

## 1. Tokens

**Reemplaza la paleta actual de `styles.css`** (crema + violeta + Montserrat/Manrope).

| Token | Valor | Uso |
|---|---|---|
| `--naranja` | `#FF8A1F` | Fondo del hero |
| `--tinta` | `#1A1530` | Texto, botón principal, bloque 21 razones |
| `--amarillo` | `#FFD23F` | Acento, contador, monedas |
| `--rosa` | `#FF5D8F` | Caja de regalo, bloque listas |
| `--celeste` | `#4CC9F0` | Confeti, acento |
| `--texto-suave` | `#4B4660` | Texto secundario sobre blanco |
| `--fondo` | `#FFFFFF` | Fondo general |
| Pasteles de chips | `#FFD23F #BDEBFA #FFC7D8 #FFD8B5 #D9F5C9 #EEE9FF #F1F1F4` | Ocasiones |
| Pasos | fondos `#FFF1E3 #FFEAF0 #E6F7FD`, números `#E06A00 #D6305F #127A9C` | "Así de fácil" |

Monedas del abanico: rotan `#FFD23F #FF8A1F #FF7FA6 #7FD3EE #A8E07F` (**ABIERTO**: ¿todas doradas?).

**Tipografía:** Bricolage Grotesque 800 (títulos, botones grandes, letter-spacing −0,01/−0,025 em) + DM Sans 400/500/700 (texto). **Autoalojadas** (woff2 en el repo), sin Google Fonts.

**Formas:** radios 14–16 px botones, 20–26 px tarjetas, 23 px chips (píldora). Botones ≥ 48 px de alto (principal 56–60 px). Confeti: rectángulos redondeados y círculos chicos en amarillo/celeste/rosa/blanco, SVG inline estático.

## 2. Home

Orden: hero naranja (logo, idioma, caja de regalo con moneda ₿ saltando, "Regalá bitcoin en un par de toques.", bajada, **Regalar bitcoin** + **Tengo un regalo para abrir**) → ¿Qué festejamos? → Así de fácil (3 pasos) → 21 razones (bloque tinta con abanico) → ¿Festejo grande? (listas, bloque rosa) → pie "Sin custodia: el regalo es de quien lo recibe."

- Microcopy: **"Tengo un regalo para abrir"** reemplaza "…para reclamar" (en home y menús).
- Compu: hero en 2 columnas (texto | ilustración), pasos en 3 tarjetas, 21 razones en 2 columnas (texto + flechas + contador | abanico).

## 3. Menú (compu)

`Regalar` (botón tinta) · `Recibir ▾` · `21 razones` · `ES`

`Recibir` despliega: **Abrir un regalo** ("Te mandaron un link: empezá acá.") · **Armar mi lista** ("Baby shower, casamiento, cumple: que te regalen bitcoin.") · **Mis regalos** ("Los que te llegaron y todavía no abriste."). "Cómo funciona" sale del menú (está en la home).
**Celular:** botón de menú (hamburguesa) junto a `ES` que despliega Regalar (botón) · Recibir (Abrir un regalo · Armar mi lista · Mis regalos) · 21 razones. Además, en el hero, un **tercer acceso** como link de texto debajo de los dos botones: "Armar mi lista de regalos →".

## 4. Selector de ocasiones

- Visibles: Cumpleaños, Bautismo, Navidad, Casamiento, Baby shower, Porque sí + **1 de temporada según el mes** con etiqueta "Se viene" (ene Reyes, feb San Valentín, mar–abr Pascuas, may Bitcoin Pizza Day, jun Día del Padre, jul Día del Amigo, ago Día del Niño, sep Día del Maestro, oct Día de la Madre, nov–dic Navidad).
- **"Más ocasiones +"** despliega panel con buscador (sin tildes) y grupos:
  - Familia y vida: Nacimiento, Bautismo, Primera comunión, Bar / Bat Mitzvá, Cumpleaños, Cumple de 15, Egresados, Recibido/a, Casamiento, Aniversario, Baby shower, Jubilación, Casa nueva
  - Fechas del año: Navidad, Reyes, Año nuevo, San Valentín, Pascuas, Día de la Madre, Día del Padre, Día del Niño, Día del Amigo, Día de los Abuelos, Día del Maestro
  - Fechas bitcoiners: Bitcoin Pizza Day, Cumple del bloque génesis, Aniversario del whitepaper, Halving
  - Otras: Nuevo trabajo, Gracias, Mejorate pronto, Porque sí
- "¿No está?": usar el texto del buscador como **ocasión libre**.
- Al elegir: botón "Regalar para <ocasión> →" (entrada al flujo Regalar con la ocasión precargada).
- **ABIERTO:** lista definitiva de Rodolfo; fechas por país (Día de la Madre AR oct vs MX/BR may) → temporada según país de quien entra.

## 5. 21 razones (abanico)

Igual que la spec de `../HANDOFF.md` §1, con estética Confeti: carta frente `#2A2347` con borde blanco 2 px y moneda de color con borde tinta y sombra dura; dorso blanco con etiqueta del número en el color de su moneda. Centro 200×280 (celular) / 240×330 (compu); laterales ±78/110 px, ±14°, escala 0,88.

## 6. Imagen de la tarjeta del regalo

- 4 estilos por ocasión: **Ilustración** (marca) · **Dibujo a mano** (trazo tembloroso, letra manuscrita) · **Elegante** (fondo noche, línea dorada, serif) · **Realista** (foto).
- Propuesta: **banco de imágenes pre-hechas** (ocasión × estilo); nombre y saludo se superponen como texto con la tipografía del estilo. Nada de nombres hacia servicios de IA.
- **"Hacela con tu IA"** (idea de Rodolfo): pestaña que arma un prompt para copiar en el ChatGPT/Gemini/Claude de la persona + links para abrirlos + "Subí tu imagen". Plantilla:
  > Hacé una imagen vertical de 1080 × 1350 px (4:5) para la tarjeta de {ocasión} de {nombre}, {a quien} le estoy regalando bitcoin. Estilo: {estilo}. Que aparezca {elementos de la ocasión} y una moneda/medallita dorada con el símbolo ₿. Clima {tono}. No escribas ningún texto, letras ni números en la imagen. Dejá el tercio de abajo con fondo liso.
- Subida de imagen: límite de tamaño, reescalar en el navegador, **borrar EXIF** (ubicación), moderación/reporte básico; la tapa de la tarjeta imprimible usa la misma imagen (4:5 recorta a A6).
- **ABIERTO:** imagen para ocasión libre (genérica vs generada); quién genera el banco realista.
