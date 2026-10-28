# Handoff 28/10/2026: topes en mainnet

Estado: INTEGRADO (PR «Topes en mainnet: listas a 250 y tope diario de 500 por cuenta» y PR
«Descartar un regalo sin pagar»: los descartados no cuentan, decidido por Claudia el 28/10).

Decidido por Rodolfo (la responsable) en Cowork, 28/10/2026. **Cuenta como autorización explícita
de cambio de topes en mainnet** (CLAUDE.md, `docs/mainnet.md`). Agregar la fila a la tabla de
autorizaciones de `docs/mainnet.md` con estas palabras:

> «Los limites en Regalos siguen siendo 100, en listas de regalo casamiento $250 puede ser, limite
> por cuenta de 500 tmb.»

Y las precisiones que dio en el mismo chat (respuestas a preguntas de Cowork):
- Los USD 500 de la cuenta son **por día** y cuentan **solo los regalos** que carga la cuenta.
- Los USD 250 en listas son **por aporte de cada invitado**.
- Las listas con billetera propia (cold wallet) quedan en **USD 250 por aporte en cualquier ocasión**.

## Topes resultantes

| Qué | Tope | Antes |
|---|---|---|
| Regalo | USD 100 por regalo | igual |
| Regalos de una cuenta | USD 500 por día (suma) | no había |
| Lista de casamiento con «Semilla nueva» | USD 250 por aporte | USD 100 |
| Lista de otra ocasión con «Semilla nueva» | USD 100 por aporte | igual |
| Lista con billetera propia (cold wallet), cualquier ocasión | USD 250 por aporte | sin tope |
| Transferencias en pesos de las listas | sin tope (no pasan por la plataforma) | igual |

## Para Code

1. `MAINNET_CEILING_USD` sigue en 100 para regalos. Sumar un techo de listas separado
   (`MAINNET_LIST_CEILING_USD = 250`) y que `listCeiling` dependa de la ocasión y del modo:
   casamiento o cold wallet → 250; «Semilla nueva» de otra ocasión → 100. Las variables de entorno
   solo pueden bajarlos, como hoy.
2. **Cold wallet pasa de sin tope a 250:** es una baja. Las listas cold wallet ya publicadas también
   quedan con 250 para aportes nuevos; los aportes ya hechos no se tocan.
3. **Tope diario por cuenta:** suma, en las últimas 24 h (ventana móvil), el monto en USD elegido al
   crear cada regalo de la cuenta. Se controla en el servidor al registrar el regalo; si lo supera,
   error claro con cuánto le queda hoy y desde cuándo puede seguir. Los regalos cancelados antes de
   recibir depósitos no cuentan. Rige también para las cuentas de admin (es un tope de seguridad de
   mainnet, no comercial).
4. La web muestra el tope que corresponde (lista: en la página del aporte; regalo: en el paso del
   monto) leyéndolo de la API, sin números fijos en los textos. Textos en es (vos y tú), pt, en, it.
5. Tests: casamiento semilla 250, cumpleaños semilla 100, cold wallet 250, sexto regalo del día que
   pasa los 500 rechazado, ventana de 24 h.

## Sigue ABIERTO (no bloquea esto)

- I5 de `docs/mainnet.md` (sin nodo propio y con Firebase delante): sigue pendiente de confirmación.
