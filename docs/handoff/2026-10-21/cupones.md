# Handoff 21/10/2026: cupones

Estado: INTEGRADO (PR «Cupones: descuentos y créditos con código, app /cupones para admins»)

Pedido de Rodolfo (Drive, «cupones»), con el prototipo de Cowork para la app de admins.

## Qué quedó

- **Cupón** = código (4 a 20 letras o números, sin distinguir mayúsculas) que da un descuento en
  planes (1 a 100 %, en todos o en algunos productos), regalos o listas gratis (opcionalmente para
  una ocasión del catálogo), o las dos cosas. Tiene desde/hasta, máximo de usos y nota interna.
- Una vez por cuenta; uno por compra. El uso se reserva al crear el pago (1 día, como el lugar de
  Genesis) y se confirma con el pago. Con 100 % de descuento no hay pago: se acredita en el acto.
- **Los créditos que da un cupón no vencen** (decisión de Rodolfo, 21/10).
- Créditos con ocasión: solo sirven para regalos o listas de esa ocasión. Orden de consumo:
  plan → créditos de la ocasión → bienvenida → comprados. No bloquean el arrepentimiento.
- Cada pago guarda cupón, porcentaje y precio original (facturación). El admin ve usos, pagos en
  curso y sats resignados.
- Migración `022_cupones.sql`; API en `apps/api/src/coupons.ts`.
- Quien compra: «¿Tenés un código?» antes de pagar (precio original tachado) y «Tengo un código»
  en «Mi plan» para canjear créditos.
- Admins: app instalable en `/cupones` (manifest e ícono propios, noindex), vista de tickets o
  lista, filtros, compartir, copiar, pausar y «Nuevo cupón». Crear o pausar pide sesión con passkey.

## ABIERTO

Nada.
