# Contenido: ¿Por qué Bitcoin?

Decidido con Rodolfo en Cowork el 13/10/2026 (registro: `docs/handoff/2026-10-13/HANDOFF.md`).
Fuente original: `docs/fuentes/el-mejor-regalo-navidad.md` (nota de ~2017, datos desactualizados).
Texto canónico de las 21 razones: `docs/contenido/razones.es.json` → va a `apps/web/src/i18n/*.ts`.
Prototipos: `docs/prototipos/` (cargan Google Fonts; la web usa tipografías propias, sin terceros).

## Reglas de contenido

- Cero promesas de precio. El disclaimer acompaña siempre a la lista.
- Español único: rioplatense con vos. pt/en/it por el i18n.
- Precios y conversiones nunca fijos en el texto; si se muestran, en vivo y con el formato
  numérico del idioma (ver CLAUDE.md).
- Sin recomendar grupos, exchanges ni tiendas puntuales.
- Lo marcado **ABIERTO** se confirma con Rodolfo antes de implementarlo.

## Especificación de componentes

### 1. Componente "21 razones" (monedas que se dan vuelta)

- Título: "Solo hay 21 millones de bitcoin" (kicker) + "21 razones para regalar Bitcoin".
- Grilla de 21 tarjetas. **Frente:** moneda dorada con el número + ₿, sin texto. **Dorso:** número, frase corta (título) y explicación debajo.
- Flip con **tap/clic**, nunca hover. Respetar `prefers-reduced-motion`.
- Cada tarjeta es un `<button aria-pressed>` con `aria-label` que incluye título + explicación.
- **El texto de ambas caras va en el HTML renderizado del servidor** (SEO: la página tiene que posicionar para "por qué regalar bitcoin"). Nada de texto en imágenes.
- Contador "Diste vuelta X de 21" + barra. Botón "Ver todas" / "Darlas vuelta de nuevo".
- Al completar 21: bloque de cierre con CTA "¿Regalamos?" → flujo de regalo.
- Diseño de moneda propio (no imitar monedas físicas reales/comerciales).
- **Home:** el abanico con las 21 (decisión de la responsable, 18/10/2026) + link a "¿Por qué Bitcoin?". `destacadas_home` queda en el JSON como selección de 6 para otros usos, pero la home no la usa.
- **Mazo en abanico** (**RESUELTO, 18/10/2026:** abanico en celular y en compu, en home y en /por-que; la grilla queda reemplazada por la lista desplegable "Ver las 21"). Referencia: `prototipos/mazo-abanico.dc.html` (lógica en la clase `Component`; formato de prototipo, reimplementar en React).
  - 3 cartas como en la mano: **centro = actual** (adelante, más grande, se da vuelta sola ~0,5 s después de llegar y muestra frase + explicación); **izquierda = anterior**, **derecha = siguiente**, inclinadas ±14°, escala 0,9, mostrando la moneda con su número. En la 1 no hay izquierda; en la 21 no hay derecha.
  - Pasar: swipe, flechas, o tocar una lateral (pasa al centro). Animación: todas las cartas se desplazan a su nuevo lugar (transform + opacity, ~0,55 s); la que sale se desvanece hacia atrás, la que entra aparece desde atrás.
  - Mientras se arrastra, la central sigue el dedo con leve rotación y la que viene se acerca al centro proporcionalmente; si se suelta antes de ~60 px vuelve a su lugar.
  - Tocar la central la da vuelta (moneda ↔ texto). Contador cuenta cartas reveladas. `prefers-reduced-motion`: sin animación.
- **RESUELTO (18/10/2026):** sale la razón del baby shower; entra «No es un vale, es bitcoin de verdad» (19).

### 2. Página "¿Por qué Bitcoin?"

Orden sugerido: componente 21 razones → "Según quién lo recibe" (5 franjas de edad) → "Nuestra historia" (sin firma ni nombres propios, sin primera persona: decisión de la responsable, 17/10/2026) → disclaimer → CTA. Los textos por edad también pueden mostrarse contextualmente al elegir ocasión en el flujo de regalo (bautismo → bebés, etc.).

### 3. Tarjeta imprimible (feature del lanzamiento)

- PDF A4, impresión **de un solo lado**, 2 tarjetas A5 por hoja; se corta y se dobla → A6 (10,5 × 14,8 cm).
- Tapa: diseño de la ocasión + nombre de quien recibe. Interior izq.: mensaje + nombre de quien regala. Interior der.: QR al link de reclamo + 3 pasos + recuadro con 4 renglones numerados para escribir a mano la passphrase. Contratapa: logo.
- **La web NUNCA imprime la passphrase.** Microcopy del recuadro: "Escribí acá las 4 palabras solo si la entregás en mano. No le saques foto a esta parte."
- Límites: mensaje **máx. 280 caracteres** (mismo para WhatsApp, mail y tarjeta; contador visible, aviso desde 240). Nombre del destinatario **máx. 30**.

### 4. Decisiones de producto relacionadas

- Listas de regalo: entran en el lanzamiento, **solo BTC**, pensadas para compartir en grupos bitcoiners. Mercado Pago/tarjeta, después.
- "Regalar entre varios" (razón 15): una dirección on-chain acepta varios depósitos; el que recibe debería ver quién aportó qué.
- Razón 17 ("vos lo recuperás"): la cancelación solo aplica mientras el regalo no fue reclamado.
- Descartado: "mandar hoy y cargar después" (no está en el producto).

## Textos

## Solo hay 21 millones de bitcoin. 21 razones para regalar Bitcoin (v3)

> Decisión: las listas de regalo entran en el lanzamiento, solo BTC, pensadas para compartir en grupos bitcoiners. Mercado Pago/tarjeta para listas queda para después.

**Formato (decisión):** tarjetas que se dan vuelta. Frente = moneda con su número (sin texto); dorso = frase corta + explicación debajo. Botón "Ver todas". Prototipo: https://claude.ai/artifact/8XCsPQyMRrbokMb6uEPuQv Flip por tap/clic (no hover). Texto de ambas caras en el HTML (SEO + accesibilidad). Mobile: 2 columnas o mazo con swipe (a definir). Opcional: contador "diste vuelta X de 21" con cierre + CTA al completar.

**Home:** las 21 en el abanico (18/10/2026). Destacadas en el JSON (`destacadas_home`), sin uso en la home: 1, 2, 4, 11, 13, 18.

**Orden por bloques (reorden del 18/10/2026, `docs/handoff/2026-10-18/reorden-21-razones.md`):** regalo (1–5) → emocional (6–10) → práctico (11–17) → bitcoiner (18–21). La 18 (autocustodia) y la 19 (contra los vales) van juntas a propósito: no fusionarlas. La 19 no nombra marcas.

1. **Es original.** Seguro que nadie más en la mesa regala lo mismo.
2. **No hay que adivinar el talle, el color ni el gusto.** Ni guardar el ticket de cambio.
3. **No ocupa lugar y no se rompe.** Entra en el celular o en un papelito, y dura más que cualquier juguete.
4. **Se ajusta a tu bolsillo.** No hace falta regalar un bitcoin entero: se divide en 100 millones de partes, así que podés regalar desde muy poquito.
5. **Sirve para cualquier edad.** Desde un bautismo hasta los 90 años del abuelo.
6. **Es personal.** Tu mensaje, su nombre y una imagen hecha para la ocasión.
7. **Lleva un mensaje.** Es una invitación a pensar en el ahorro y en el largo plazo.
8. **Es el mismo regalo para todos, pero cada uno lo vive distinto.** A uno le despierta curiosidad, otro lo guarda y otro arranca a investigar.
9. **Va a disparar una linda charla, seguro.** Alguien pregunta qué es, y la sobremesa ya está armada.
10. **Une generaciones.** El nieto le explica al abuelo, o el abuelo sorprende al nieto sabiendo más.
11. **Llega aunque estés lejos.** Sin envío, sin aduana y sin cambio de moneda: el mismo regalo vale para tu sobrino en Brasil y para tu abuela en Italia.
12. **Se arma en dos minutos.** Desde el celular, también la noche anterior, y sin que se note que fue de último momento.
13. **No hace falta una computadora para recibirlo.** Lo imprimís en una tarjeta, se lo das en mano y lo reclama cuando quiera.
14. **Viene con instrucciones.** Una guía paso a paso para crear su billetera y reclamarlo. Y sin pilas.
15. **Se puede regalar entre varios.** Cada uno pone lo que puede y le llega todo junto.
16. **Sabés si lo reclamó.** Ves cuándo lo hizo, sin tener que preguntar.
17. **Si no lo quiere, vos lo recuperás o él lo canjea por dinero.** No hay regalo que quede tirado.
18. **Es de quien lo recibe, de verdad.** Queda en su propia billetera: ni nosotros ni nadie se lo puede congelar ni quitar.
19. **No es un vale, es bitcoin de verdad.** Un vale tiene fecha, un catálogo y una empresa detrás que lo tiene que honrar. Esto ya es bitcoin desde el primer día, no vence y lo usa como quiera.
20. **Funciona desde 2009 y nunca cerró.** Ni un feriado, ni un domingo, ni un 25 de diciembre.
21. **Nunca va a haber más de 21 millones.** Le estás regalando un pedacito de algo que nadie puede fabricar.

Descartadas: "mandar hoy y cargar después" (no va en el producto), "si no lo quiere, otro se lo compra", "más interesante mientras más lo guardan", "enseña sin sermonear" (reemplazada por la 9, antes 7), "no junta polvo", "se lo podés regalar a alguien que todavía no nació" (baby shower, 18/10).

> **Importante:** el precio de bitcoin sube y baja, y lo que pasó antes no garantiza lo que vaya a pasar. Regalá lo que tenga sentido para vos, como cualquier otro regalo.

## Nuestra historia

Todo empezó en la Navidad de 2012, con una obrita de teatro para la fiesta familiar: una "Natividad Moderna", con José, María y un Gabriel Arcángel que llamaba a la carpintería. Al final, el mago Baltazar hacía aparecer una moneda detrás de la oreja del niño: "No es oro. Es bitcoin, el oro del futuro".

Esa noche, cada invitado se llevó una cajita con una moneda física de bitcoin. En ese momento un bitcoin valía unos 13 dólares. Nadie necesitó una computadora ni una app para recibirla, y muchos todavía la tienen.

Ese mismo espíritu tiene Regalale Bitcoin: un regalo simple, con un mensaje, que se puede guardar por años.

(Sin firma. El cuento completo, "Una Natividad Moderna", es de Florando Dragones.)

## Por qué bitcoin, según quién lo recibe

**Bebés y bautismos (0–4).** Antes se regalaba una medallita de oro para que acompañara toda la vida. Esto es lo mismo, pero en digital. Lo guardan los padres hasta que el chico sea grande, y si encima le escribís unas palabras, va a ser de los regalos más especiales que reciba.

**Chicos (5–12).** Ya juntan monedas en sus jueguitos. Podés contarles que esta es una moneda de verdad, mantenida por miles de personas en todo el mundo, y que por ahora la cuidan sus papás. Es su primera lección de ahorro.

**Adolescentes (13–17).** Les interesan la independencia y las ideas propias, y probablemente ya escucharon hablar de bitcoin. Les estás regalando un tema de conversación sobre dinero, valor y escasez, y a lo mejor te sorprenden sabiendo más que vos.

**Adultos (18–69).** Casi todos escucharon hablar de bitcoin y muchos alguna vez pensaron en tener un poco. Este puede ser el empujón: les llega el regalo con una guía para crear su propia billetera paso a paso.

**Mayores (70+).** ¿Qué le regalás a alguien que ya tiene todo? Algo totalmente inesperado, que lo mete en una de las conversaciones de esta época. Si necesita ayuda para reclamarlo, es la excusa perfecta para sentarse juntos un rato.

## Tarjeta imprimible (spec v2)

**Formato:** tarjeta doblada. Hoja A4 impresa de un solo lado con 2 tarjetas A5; se corta y cada una se dobla al medio y queda en A6 (10,5 × 14,8 cm). No requiere impresora doble faz.

**Caras (cerrada / abierta):**
- **Tapa:** diseño de la ocasión + nombre de quien recibe (máx. 30 caracteres).
- **Interior izquierdo:** el mensaje de quien regala + su firma/nombre.
- **Interior derecho:** QR al link de reclamo + "cómo reclamarlo" en 3 pasos + recuadro para escribir a mano las 4 palabras (4 renglones numerados).
- **Contratapa:** logo RegalaleBitcoin.com + leyenda corta.

**Passphrase:** nunca impresa por la web. Recuadro manual opcional, adentro de la tarjeta (cerrada no se ve). Microcopy: "Escribí acá las 4 palabras solo si la entregás en mano. No le saques foto a esta parte. Guardá esta tarjeta como si fuera efectivo." El PDF se genera en el navegador: el link nunca pasa por el servidor.

**Mensaje:** máximo 280 caracteres (mismo límite para WhatsApp, mail y tarjeta). Contador visible; aviso desde 240.

## Navidad (bloque estacional)

Nada de shopping el 24 a la noche: se arma en dos minutos desde el celular, también a las 23:50. Este año regalá algo que nadie espera. Elegís el monto y escribís tu mensaje, y le llega por WhatsApp o por mail para abrirlo cuando quiera, aunque sea después de las fiestas.

## Revisión técnica (Code, 13/10/2026)

Cruce del contenido con el modelo del producto. Lo marcado **A CONFIRMAR** espera respuesta.
Los números son los de antes del reorden del 18/10: la 12 es hoy la 15, la 13 la 17, la 14 la 18
y la 18 la 16.

1. **RESUELTO (Claudia, 13/10) — razón 14 contradecía la 13; texto actualizado.** La 14 dice "queda en su propia billetera: ni
   nosotros ni nadie se lo puede quitar", pero la 13 (y el modelo: la semilla del regalo se
   deriva de la clave de quien regala) dice que, mientras no lo reclamó, quien regala lo
   recupera. Propuesta para la 14: "**Una vez que lo reclama, es suyo de verdad.** Pasa a su
   propia billetera: ni nosotros ni nadie se lo puede congelar ni quitar."
2. **RESUELTO (Claudia, 13/10) — la tarjeta es para entregar en mano. Tarjeta imprimible: el QR contiene la semilla** (el link lleva la semilla después del `#`).
   La tarjeta es medio regalo; con las 4 palabras escritas a mano, es el regalo entero, como
   un billete. Implicancias: el PDF se genera en el navegador (el link nunca pasa por el
   servidor) y el recuadro de las palabras suma "Guardá esta tarjeta como si fuera efectivo".
3. **Razones que prometen funciones que todavía no existen.** La 12 ("quién aportó qué") pide
   que cada aporte pase por nuestro flujo (on-chain no hay nombres); la 18 ("sabés si lo
   reclamó") llega con los paneles (etapa 6). Se publican cuando la función exista o se
   ajusta el texto. **Decisión (18/10/2026):** la 15 y la 16 (números nuevos) quedan como están.
4. **SEO.** La web hoy es una SPA; para que el texto de las 21 razones esté en el HTML se
   prerenderizan home y /por-que en el build (Preact a HTML estático, sin servidor nuevo).
5. **Listas solo BTC en el lanzamiento** cambia la especificación v0.1 (xpub + alias bancario):
   el alias bancario con conversión por tandas pasa a después del lanzamiento.
