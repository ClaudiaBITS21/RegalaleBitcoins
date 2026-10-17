# Estilo "Realista": banco de fotos

El código no genera fotos: el estilo Realista es un **banco de imágenes pre-hechas** (una o
varias por ocasión) que se suben al repo y se sirven desde el mismo sitio. El nombre de quien
recibe va encima como texto, nunca dentro de la imagen, y ningún dato del regalo sale hacia un
servicio de IA.

## Formato

- Horizontal **1280 × 1000 px** (la tarjeta es 320 × 250), exportada a **WebP**, calidad 80,
  menos de 200 KB.
- Archivo: `apps/web/public/tarjetas/realista/<ocasion>-<n>.webp` (ej. `cumple-1.webp`).
- Sin texto, letras ni números en la imagen (salvo el ₿ de la moneda).
- Franja de abajo (20 %) con fondo liso o desenfocado: ahí va el nombre.
- Sin caras reconocibles ni marcas. La moneda es "una moneda dorada con el símbolo ₿",
  sin imitar monedas reales.
- Derechos: generada por nosotros o de banco con licencia comercial, anotada en la tabla.

## Pedidos para generar (primera tanda)

Plantilla común, al final de cada pedido:
> Foto realista, horizontal 1280 × 1000. Sin texto, letras ni números. Sin caras reconocibles
> ni marcas. Una moneda dorada con el símbolo ₿, sin otras inscripciones. Dejá la franja de abajo
> con fondo liso y desenfocado.

| Ocasión | Pedido |
|---|---|
| `cumple` | Torta casera de cumpleaños con dos velas encendidas sobre una mesa de madera; una moneda dorada con ₿ apoyada al lado de la torta. Luz cálida de tarde, fondo de living desenfocado con guirnaldas. |
| `bautismo` | Ropón blanco de bautismo doblado sobre una manta tejida celeste, con una medallita dorada con ₿ y una cinta celeste. Luz suave de ventana. |
| `navidad` | Arbolito de Navidad con luces cálidas desenfocadas; colgada de una rama, como adorno, una moneda dorada con ₿. Primer plano de la rama, bokeh de fondo. |
| `reyes` | Tres pares de zapatitos junto a una ventana con pasto y un vaso de agua, como en la noche de Reyes; dentro de un zapato, una moneda dorada con ₿. Luz de amanecer. |
| `casamiento` | Dos alianzas doradas sobre un pañuelo de lino junto a una moneda dorada con ₿ y pétalos blancos. Luz suave, tonos crema. |
| `nacimiento` | Manta de bebé tejida y un sonajero de madera; sobre la manta, una moneda dorada con ₿. Luz de mañana, tonos pastel. Sin bebé visible. |
| `diamadre` | Ramo de flores de estación envuelto en papel madera sobre una mesa, con una tarjetita en blanco y una moneda dorada con ₿. Luz cálida. |

## Banco

| Archivo | Ocasión | Origen | Licencia |
|---|---|---|---|
| — | — | — | — |
