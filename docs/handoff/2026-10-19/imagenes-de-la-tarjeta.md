# Handoff 19/10/2026: imágenes de la tarjeta (una por estilo) y pedido a la IA con el nombre

Estado: INTEGRADO (commit 3a2c162)

Decidido por Rodolfo en chat, 19/10/2026. Copiado de la carpeta de Drive «RegalaleBitcoin -
handoffs» (`2026-10-19 - imágenes de la tarjeta.md`). Afecta el paso «Para quién»
(`StylePicker.tsx`) y `content/GiftCardArt.tsx`.

## 1. Una sola imagen por estilo, grande, con el nombre puesto

- Se termina la grilla de 4 variantes por estilo. Cada estilo (Ilustración, Dibujo a mano,
  Elegante) tiene **una sola imagen**, que se muestra **grande** (ancho completo de la columna del
  formulario) y **con el nombre de quien recibe ya escrito encima**, igual que va a llegar.
- **Al tocar la imagen cambia al estilo siguiente**: Ilustración → Dibujo a mano → Elegante →
  Ilustración. «Con tu IA» queda fuera del ciclo.
  - La imagen es un `<button>` con `aria-label` «Estilo: Ilustración. Tocá para ver otro estilo»
    (y versión con tú). Debajo, un texto chico: «Tocá la imagen para ver otro estilo».
  - Los botones de estilo de arriba (incluido «Con tu IA») se quedan.
  - Cambio sin animación.
- Si todavía no hay nombre, se muestra sin etiqueta.

## 2. Borrar todo lo que sobra de las variantes

- Se queda la variante 1 de cada estilo y se borra el resto: variantes 2–4, `CARD_VARIANTS`, las
  decoraciones que solo usaban ellas, `shift`, los otros fondos de Elegante, `cardVariant` y el
  `seed` por variante del dibujo a mano.
- En el picker: `.grilla-imagenes`, `.imagen-opcion` y la clave `regalar.para.imagenN`.
- **Regalos viejos** con `imagen` 2–4 se muestran con la imagen única de su estilo. Sin migración.
- **API:** el campo `imagen` queda por compatibilidad; la web manda siempre 1.

## 3. «Con tu IA»: el nombre lo pone la IA, nosotros no

- Nuevo pedido (`regalar.ia.prompt`, con `{ocasion}` y `{nombre}`): «…Idealmente sin texto ni
  números en la imagen, salvo abajo al centro, donde va el nombre «{nombre}» dentro de un banner
  tipo cinta (ribbon banner).» Con tú, «Haz…». En pt, en e it, traducido y con «ribbon banner».
- `OwnCard` ya no pinta `.arte-propia-nombre` (vista previa, mail, reclamo, tarjeta imprimible).
- La web sigue sin mandar nada a ningún servicio de IA: el pedido lo copia y lo pega la persona. Los
  links «Abrir en ChatGPT / Claude» con `?q=` llevan el nombre en la URL porque la persona los toca;
  no se registra en nada nuestro.
- **Recorte:** `processOwnImage` recorta anclado **abajo** cuando sobra alto (cuando sobra ancho,
  sigue centrado), para no cortar la cinta con el nombre.

## Qué no cambia

- Proporción 320 × 250 (5:4), los motivos por ocasión, la moneda dorada con ₿.
- La passphrase nunca aparece en ninguna imagen.

## Nota de Code

- El handoff pedía borrar `apps/e2e/imagenes.ts`, pero ese archivo genera los íconos y la imagen
  para compartir links; no tiene nada de las variantes. Se dejó. La prueba que recorría las
  variantes era `apps/e2e/simulado.ts` («Imagen 3»): ahora toca la imagen, controla que pase a
  Dibujo a mano y que lleve el nombre, y que el pedido a la IA nombre a quien recibe.
