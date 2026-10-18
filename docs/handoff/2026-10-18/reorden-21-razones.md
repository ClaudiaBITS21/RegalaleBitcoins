# Handoff 18/10/2026: reorden de las 21 razones

Estado: INTEGRADO (commit 5ac848c)

Trabajado con Rodolfo en Cowork el 18/10/2026. Cowork no pudo subir la rama `cowork/razones`;
el contenido llegó por el chat y se integró desde `main`.

## Qué cambia

- Sale la razón del baby shower ("Se lo podés regalar a alguien que todavía no nació"). Cierra el
  ABIERTO de la razón 20.
- Entra una razón nueva (queda como 19).
- A "No ocupa lugar..." se le saca "no se vence".
- Nuevo orden por bloques: regalo → emocional → práctico → bitcoiner.

## Las 21, en el orden nuevo

1. Es original. Seguro que nadie más en la mesa regala lo mismo.
2. No hay que adivinar el talle, el color ni el gusto. Ni guardar el ticket de cambio.
3. No ocupa lugar y no se rompe. Entra en el celular o en un papelito, y dura más que cualquier juguete.
4. Se ajusta a tu bolsillo. No hace falta regalar un bitcoin entero: se divide en 100 millones de partes, así que podés regalar desde muy poquito.
5. Sirve para cualquier edad. Desde un bautismo hasta los 90 años del abuelo.
6. Es personal. Tu mensaje, su nombre y una imagen hecha para la ocasión.
7. Lleva un mensaje. Es una invitación a pensar en el ahorro y en el largo plazo.
8. Es el mismo regalo para todos, pero cada uno lo vive distinto. A uno le despierta curiosidad, otro lo guarda y otro arranca a investigar.
9. Va a disparar una linda charla, seguro. Alguien pregunta qué es, y la sobremesa ya está armada.
10. Une generaciones. El nieto le explica al abuelo, o el abuelo sorprende al nieto sabiendo más.
11. Llega aunque estés lejos. Sin envío, sin aduana y sin cambio de moneda: el mismo regalo vale para tu sobrino en Brasil y para tu abuela en Italia.
12. Se arma en dos minutos. Desde el celular, también la noche anterior, y sin que se note que fue de último momento.
13. No hace falta una computadora para recibirlo. Lo imprimís en una tarjeta, se lo das en mano y lo reclama cuando quiera.
14. Viene con instrucciones. Una guía paso a paso para crear su billetera y reclamarlo. Y sin pilas.
15. Se puede regalar entre varios. Cada uno pone lo que puede y le llega todo junto.
16. Sabés si lo reclamó. Ves cuándo lo hizo, sin tener que preguntar.
17. Si no lo quiere, vos lo recuperás o él lo canjea por dinero. No hay regalo que quede tirado.
18. Es de quien lo recibe, de verdad. Queda en su propia billetera: ni nosotros ni nadie se lo puede congelar ni quitar.
19. No es un vale, es bitcoin de verdad. Un vale tiene fecha, un catálogo y una empresa detrás que lo tiene que honrar. Esto ya es bitcoin desde el primer día, no vence y lo usa como quiera.
20. Funciona desde 2009 y nunca cerró. Ni un feriado, ni un domingo, ni un 25 de diciembre.
21. Nunca va a haber más de 21 millones. Le estás regalando un pedacito de algo que nadie puede fabricar.

`destacadas_home`: 1, 2, 4, 11, 13, 18 (son las mismas 6 de antes, con número nuevo).

## Notas

- 18 y 19 van juntas a propósito (18 = autocustodia, 19 = contra vouchers); no fusionarlas.
- La 19 no nombra marcas.
- Se mantienen el disclaimer de precio y la regla de cero promesas de precio.

## Dónde quedó

- `docs/contenido/razones.es.json` (fuente de verdad) y `docs/contenido.md` (lista, destacadas,
  ABIERTO de la 20 cerrado, referencias por número actualizadas).
- `apps/web/src/content/razones.ts` (es, pt, en, it) y `razones-tu.ts` (castellano con tú), en el
  mismo orden; traducciones nuevas para la 3, la 18 y la 19.
