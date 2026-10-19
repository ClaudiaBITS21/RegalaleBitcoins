# Handoff 19/10/2026: ícono naranja y link de cuentos

Estado: INTEGRADO (commit 8a684cb)

Copiado de la carpeta de Drive «RegalaleBitcoin - handoffs» (`2026-10-19 - ícono naranja y link de
cuentos.md`). Dos cambios pedidos por Rodolfo el 19/10/2026.

## 1. Ícono de la web con fondo naranja

- El ícono (favicon, ícono del celular, PWA) pasa de caja naranja sobre negro a **caja blanca sobre
  naranja** (la variante «sobre naranja» de `GiftMark`).
- `apps/web/public/marca.svg`: cuadrado redondeado #FF8A1F; caja y moño blancos, borde y sombra
  tinta #1A1530, ₿ naranja.
- `apps/e2e/imagenes.ts`: los íconos a sangre (apple-touch y maskable) usan fondo #FF8A1F. Los PNG
  se regeneran con `node apps/e2e/imagenes.ts`.
- `site.webmanifest`: `short_name` pasa a «Regalale Bitcoin» (en iPhone, al agregar a inicio,
  salía «Regalale»). Para verlo hay que borrar el ícono y volver a agregarlo.
- No cambian: `favicon.svg` (la moneda), `og.jpg`, la variante `negro` de `GiftMark`,
  `theme_color` y `background_color`.

## 2. Link «Más cuentos» en la tarjeta del cuento (/por-que)

- El link a YouTube va **después del botón** «Bajar el cuento» y **más chico** (14 px, peso 600).
- Texto: «Más cuentos para niños en YouTube →» (traducido igual en pt, en e it).
