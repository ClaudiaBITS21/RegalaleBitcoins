# Handoff: contenido "¿Por qué Bitcoin?" + 21 razones + tarjeta imprimible

> **Integrado** en `etapa-3-reclamo`: el contenido quedó en `docs/contenido.md`, las razones en `docs/contenido/razones.es.json`, la nota en `docs/fuentes/` y los prototipos en `docs/prototipos/`. Este archivo queda como registro.

Brief para el repo `ClaudiaBITS21/RegalaleBitcoins` (rama de trabajo actual: `etapa-3-reclamo`). Trabajado con Rodolfo en Cowork el 13/10/2026. Lo decidido está decidido; lo marcado **ABIERTO** consultarlo con Rodolfo antes de implementar.

> **Diseño:** ver `diseno/DISENO.md` (línea visual Confeti, tokens, home, menú Regalar/Recibir, selector de ocasiones, tarjetas, "Hacela con tu IA").

## Cómo integrarlo al repo

- **Reemplaza las decisiones de `docs/contenido.md`.** Actualizar ese archivo con este contenido (no crear docs paralelos). Mover `contenido/por-que-bitcoin.md` y `fuentes/` a `docs/` como corresponda.
- **i18n:** las 21 razones van al sistema existente (`apps/web/src/i18n/{es,pt,en,it}.ts`), no a JSON sueltos. `contenido/razones.es.json` es solo la fuente de texto en es; las traducciones pt/en/it están pendientes.
- **Cero terceros:** el prototipo carga Google Fonts solo por comodidad. En la web, tipografías self-hosted (o del sistema), sin requests externos.

## Diferencias resueltas con `docs/contenido.md`

| Tema | Antes (contenido.md) | Ahora (decidido con Rodolfo) |
|---|---|---|
| Lista de razones | 11 razones de la nota | **21 razones** ("Solo hay 21 millones…"), en monedas que se dan vuelta |
| Idea 1 "regalar el envoltorio y fondear después" | A decidir | **Descartada.** No va en el producto. |
| Idea 2 tarjeta imprimible | A decidir; palabras en otra hoja o dorso tapado | **Va en el lanzamiento.** Tarjeta doblada; la web nunca imprime las palabras; recuadro interior para escribirlas a mano (ver §3). |
| Idea 3 "Nuestra historia" | Si hay permiso | **Permiso dado.** Año correcto: **Navidad de 2012** (no 2013). Texto en `contenido/por-que-bitcoin.md`. |
| Franjas de edad | 7 franjas con solapamientos (11–15/15–18, hueco 18–20) | **5 franjas:** 0–4, 5–12, 13–17, 18–69, 70+ |
| Listas de regalo | Según especificación | En el lanzamiento, **solo BTC**, pensadas para compartir en grupos bitcoiners |
| "Si no lo quiere…" | Se puede vender | **ABIERTO** (propuesta): "Mientras no lo reclamó vos lo recuperás; si lo reclamó, lo canjea por dinero cuando quiera." |

## Archivos

| Archivo | Qué es |
|---|---|
| `contenido/razones.es.json` | **Fuente de verdad** de las 21 razones (es-AR). Usar este JSON, no copiar texto a mano. |
| `contenido/por-que-bitcoin.md` | Todo el contenido: 21 razones, "Nuestra historia", textos por edad, spec de tarjeta imprimible, bloque Navidad. |
| `prototipos/grilla.dc.html`, `prototipos/mazo-abanico.dc.html` | Prototipos de diseño (formato Design de Claude: HTML + clase `Component`). Fuente visual y de comportamiento de grilla y abanico. |
| `prototipos/monedas-21.html` | Prototipo de referencia (vanilla) del componente de monedas. Reimplementar en el stack del proyecto. Se sirve con cualquier server estático desde docs/handoff/2026-10-13/ |
| `fuentes/el-mejor-regalo-navidad.md` | Nota original de Rodolfo (~2017). Solo contexto; datos desactualizados. |

## Reglas de contenido (no negociables)

- **Cero promesas de precio.** Nada de "va a valer más", "pequeña fortuna", proyecciones. El disclaimer va siempre con la lista.
- **Español único: rioplatense con vos.** pt/en/it por el i18n existente.
- No hardcodear precios ni conversiones en textos; si se muestran, en vivo.

## 1. Componente "21 razones" (monedas que se dan vuelta)

- Título: "Solo hay 21 millones de bitcoin" (kicker) + "21 razones para regalar Bitcoin".
- Grilla de 21 tarjetas. **Frente:** moneda dorada con el número + ₿, sin texto. **Dorso:** número, frase corta (título) y explicación debajo.
- Flip con **tap/clic**, nunca hover. Respetar `prefers-reduced-motion`.
- Cada tarjeta es un `<button aria-pressed>` con `aria-label` que incluye título + explicación.
- **El texto de ambas caras va en el HTML renderizado del servidor** (SEO: la página tiene que posicionar para "por qué regalar bitcoin"). Nada de texto en imágenes.
- Contador "Diste vuelta X de 21" + barra. Botón "Ver todas" / "Darlas vuelta de nuevo".
- Al completar 21: bloque de cierre con CTA "¿Regalamos?" → flujo de regalo.
- Diseño de moneda propio (no imitar monedas físicas reales/comerciales).
- **Home:** mismo componente con las 6 destacadas (`destacadas_home` en el JSON) + link "Ver las 21".
- **Mazo en abanico** (a Rodolfo le gustó el diseño; **ABIERTO**: confirmar si en celular reemplaza a la grilla y qué va en compu). Referencia: `prototipos/mazo-abanico.dc.html` (lógica en la clase `Component`; formato de prototipo, reimplementar en React).
  - 3 cartas como en la mano: **centro = actual** (adelante, más grande, se da vuelta sola ~0,5 s después de llegar y muestra frase + explicación); **izquierda = anterior**, **derecha = siguiente**, inclinadas ±14°, escala 0,9, mostrando la moneda con su número. En la 1 no hay izquierda; en la 21 no hay derecha.
  - Pasar: swipe, flechas, o tocar una lateral (pasa al centro). Animación: todas las cartas se desplazan a su nuevo lugar (transform + opacity, ~0,55 s); la que sale se desvanece hacia atrás, la que entra aparece desde atrás.
  - Mientras se arrastra, la central sigue el dedo con leve rotación y la que viene se acerca al centro proporcionalmente; si se suelta antes de ~60 px vuelve a su lugar.
  - Tocar la central la da vuelta (moneda ↔ texto). Contador cuenta cartas reveladas. `prefers-reduced-motion`: sin animación.
- **ABIERTO:** razón 20 (baby shower) confirmada o reemplazar.

## 2. Página "¿Por qué Bitcoin?"

Orden sugerido: componente 21 razones → "Según quién lo recibe" (5 franjas de edad) → "Nuestra historia" (firma Rodolfo Andragnes) → disclaimer → CTA. Los textos por edad también pueden mostrarse contextualmente al elegir ocasión en el flujo de regalo (bautismo → bebés, etc.).

## 3. Tarjeta imprimible (feature del lanzamiento)

- PDF A4, impresión **de un solo lado**, 2 tarjetas A5 por hoja; se corta y se dobla → A6 (10,5 × 14,8 cm).
- Tapa: diseño de la ocasión + nombre de quien recibe. Interior izq.: mensaje + nombre de quien regala. Interior der.: QR al link de reclamo + 3 pasos + recuadro con 4 renglones numerados para escribir a mano la passphrase. Contratapa: logo.
- **La web NUNCA imprime la passphrase.** Microcopy del recuadro: "Escribí acá las 4 palabras solo si la entregás en mano. No le saques foto a esta parte."
- Límites: mensaje **máx. 280 caracteres** (mismo para WhatsApp, mail y tarjeta; contador visible, aviso desde 240). Nombre del destinatario **máx. 30**.

## 4. Decisiones de producto relacionadas

- Listas de regalo: entran en el lanzamiento, **solo BTC**, pensadas para compartir en grupos bitcoiners. Mercado Pago/tarjeta, después.
- "Regalar entre varios" (razón 12): una dirección on-chain acepta varios depósitos; el que recibe debería ver quién aportó qué.
- Razón 13 ("vos lo recuperás"): la cancelación solo aplica mientras el regalo no fue reclamado.
- Descartado: "mandar hoy y cargar después" (no está en el producto).
