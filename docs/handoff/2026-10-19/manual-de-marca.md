# 19/10/2026: manual de marca

Estado: INTEGRADO EN PARTE (ver «Qué falta»)

Manual de identidad v1 (19/10/2026), en un artifact de Claude (privado de la responsable):
https://claude.ai/artifact/Pnhpyp9nLcPnq8B9nfgct4. Lo que pide para la web:

- **El nombre en un texto:** separado, sin itálica ni negrita (el color es el único énfasis).
  - Sobre claro, #B85300, también en títulos (antes los títulos iban #D96400).
  - Sobre oscuro, blanco.
  - **Sobre naranja, blanco y en negrita** (en un título ya es negrita).
    - El manual tiene una contradicción: su tabla de contraste dice que blanco sobre naranja (2,4:1) es «nunca para texto».
    - Rodolfo lo resolvió el 19/10: el nombre va en blanco sobre naranja.
  - Donde no hay color, itálica (en WhatsApp, `_Regalale Bitcoin_`).
  - En asunto de mail, pestaña, notificaciones y metadatos, a secas.
- **El acento sigue al trato:** con vos «Regalale Bitcoin», con tú «Regálale Bitcoin». En mayúsculas
  (el logotipo) nunca lleva acento. Si no se sabe el trato (metadatos, imagen para compartir), va
  sin acento. En pt, en e it, «Regalale Bitcoin».
- **Logotipo:** en pantallas de menos de 300 px queda solo la caja.
- **Ícono:** el de fondo naranja (ya integrado, handoff «ícono naranja y link de cuentos»).
- **Voz:** «Tengo un regalo para abrir» (no «reclamar»), «costo por servicio» (no «comisión»), sin
  promesas de precio.

## Qué quedó (código)

- `--marca-titulo` pasa a #B85300; sobre naranja (`.hero`, `.porque-hero`) el nombre va en blanco,
  y en negrita fuera de los títulos.
- `ConMarca` reconoce «Regalale Bitcoin» y «Regálale Bitcoin». Con tú, los textos con la marca
  (`tu.ts`, comparativa) dicen «Regálale Bitcoin»; el test de tú ya no exime a la marca, así que
  un «Regalale» sin acento con tú cuenta como voseo.
- Menos de 300 px: solo la caja.
- Hoy ningún mensaje de WhatsApp lleva el nombre; cuando lo lleve, va `_Regalale Bitcoin_`.

## Qué falta

- `regalalebitcoin.com/mediakit`: todo el manual y las descargas en esa página (pedido de Rodolfo,
  19/10). Va en un PR aparte.
