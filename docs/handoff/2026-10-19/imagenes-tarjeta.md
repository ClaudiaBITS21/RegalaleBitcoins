# Handoff 19/10/2026: imágenes de la tarjeta (una por estilo) y pedido a la IA con el nombre

Estado: PENDIENTE

Decidido por Rodolfo en chat, 19/10/2026. Afecta el paso «Para quién» (`StylePicker.tsx`) y
`content/GiftCardArt.tsx`.

## 1. Una sola imagen por estilo, grande, con el nombre puesto

- Se termina la grilla de 4 variantes por estilo. Cada estilo (Ilustración, Dibujo a mano,
  Elegante) tiene **una sola imagen**, que se muestra **grande** (ancho completo de la columna
  del formulario) y **con el nombre de quien recibe ya escrito encima** (`name={draft.to}`),
  igual que va a llegar.
- **Al tocar la imagen cambia al estilo siguiente**: Ilustración → Dibujo a mano → Elegante →
  Ilustración. «Con tu IA» queda fuera del ciclo (no hay imagen que mostrar hasta que la suben).
  - La imagen es un `<button>` con `aria-label` tipo «Estilo: Ilustración. Tocá para ver otro
    estilo» (y versión con tú). Debajo, un texto chico: «Tocá la imagen para ver otro estilo».
  - Los botones de estilo de arriba (incluido «Con tu IA») se quedan: sirven para elegir
    directo y para lectores de pantalla. Lo elegido con uno u otro es lo mismo (`draft.style`).
  - Cambio sin animación brusca; si hay transición, respetar `prefers-reduced-motion`.
- Si todavía no hay nombre (no debería pasar, el campo está antes), se muestra sin etiqueta.

## 2. Borrar todo lo que sobra de las variantes

Pedido explícito de Rodolfo: «Borrá todo lo que sobra de imágenes». Se queda la variante 1 de
cada estilo y se borra el resto:

- `VARIANTS` 2, 3 y 4, `CARD_VARIANTS`, el fondo/decoración que solo usaban ellas (`nubes`,
  `rayos`, `estrellas` en `Decoration`, `shift`, `NOCHE[1..3]`), `cardVariant` (o reducirlo a
  devolver siempre 1), el `seed` por variante del dibujo a mano.
- En el picker: `.grilla-imagenes`, `.imagen-opcion` (las dos definiciones en `styles.css`) y la
  clave `regalar.para.imagenN` en todos los idiomas.
- `apps/e2e/imagenes.ts` y los tests que recorran las 4 variantes.
- **Regalos viejos:** los que ya tienen `imagen` 2–4 guardado (hay mainnet desde el 17/10) se
  muestran con la imagen única de su estilo. No hace falta migrar la base.
- **API:** el campo `imagen` puede quedar por compatibilidad (los nuevos mandan siempre 1) o
  sacarse con migración; lo que te resulte más limpio, sin romper regalos existentes.

## 3. «Con tu IA»: el nombre lo pone la IA, nosotros no

- **Nuevo pedido** (`regalar.ia.prompt`, ahora con `{ocasion}` y `{nombre}`):

  > Hacé una imagen horizontal (proporción 5:4) para una tarjeta de regalo de {ocasion}: le
  > estoy regalando bitcoin a alguien querido. Estilo: ilustración cálida y colorida. Que
  > aparezcan elementos de la ocasión y una moneda dorada con el símbolo ₿. Idealmente sin
  > texto ni números en la imagen, salvo abajo al centro, donde va el nombre «{nombre}» dentro
  > de un banner tipo cinta (ribbon banner).

  Versión con tú (`tu.ts`): «Haz una imagen… Que aparezcan… Idealmente sin texto ni números…»
  (mismo texto, solo cambia «Hacé» → «Haz»). Traducir igual a pt, en, it, conservando el
  término «ribbon banner» entre paréntesis en pt/it para que la IA lo entienda.
- `{nombre}` = `draft.to` tal cual lo escribió la persona.
- **Sacar el nombre que superponemos** a la imagen propia: `OwnCard` deja de pintar
  `.arte-propia-nombre` en todos lados (vista previa, mail, página de reclamo, tarjeta
  imprimible). Borrar esa clase del CSS.
- Actualizar el comentario de `StylePicker.tsx` («el pedido no lleva nombres»): ahora lleva el
  nombre de quien recibe, pero sigue valiendo lo importante — **la web no manda nada a ningún
  servicio de IA**; el pedido lo copia y lo pega la persona. Ojo con el link «Abrir en ChatGPT /
  Claude» con `?q=`: el nombre viaja en la URL hacia esa IA porque la persona tocó el link; está
  bien, pero que no se registre en ningún log nuestro.
- **Recorte:** `processOwnImage` recorta al centro. Si la IA devuelve una imagen más alta que
  5:4, el recorte centrado puede cortar la cinta con el nombre. Cambiar a recorte anclado
  **abajo** cuando sobra alto (cuando sobra ancho, sigue centrado).

## Qué no cambia

- Proporción 320 × 250 (5:4), los motivos por ocasión, la moneda dorada con ₿.
- La passphrase nunca aparece en ninguna imagen.
