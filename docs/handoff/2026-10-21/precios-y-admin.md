# Handoff 21/10/2026: cambios en Precios

Estado: INTEGRADO (PR «Precios: Hodler sin vencimiento, Satoshi sin salutación»), salvo lo ABIERTO.

Rama `cowork/precios-2026-10-21` (desde `main` 1689c35). Pedido de Rodolfo en chat. La rama no
llegó a GitHub: Code rehízo los cambios desde esta descripción.

## Hecho en esta rama (front + una migración)

Compu (tabla):
1. «Quedan N lugares» de Genesis va **debajo** del botón Comprar, no arriba.
2. Tarjeta imprimible en lo gratis: rayita (no incluye). Ya no dice «Solo vista previa».
3. **Satoshi no incluye la salutación automática** (rayita).
4. **Timechain pasa a llamarse Hodler y no vence**: 30 regalos + 3 listas, como créditos.
   Migración `020_hodler_sin_vencimiento.sql`: `productos.anual` queda con `plan = null` y
   `dias = null`. El código del producto sigue siendo `anual`.
5. Vigencia: «No vencen» en todos (también Genesis, antes «Para siempre»).

Celular (tarjetas):
- Los mismos cambios. Genesis muestra «Solo 21» arriba y «Quedan N lugares» debajo del botón.
- Cada plan pago lista **todo lo que trae por encima de lo gratis** («Todo lo gratis, y además:»),
  no solo la diferencia con el plan anterior. Clave nueva `precios.todoLoGratis` en es/pt/en/it.

Admin (`apps/web/src/admin/AdminCobro.tsx`): productos, pagos y arrepentimientos muestran el
nombre de Precios (Satoshi, Node, Hodler, Genesis) con el código interno al lado, sacado de las
mismas claves de i18n. «Lugares de fundador» pasa a «lugares de Genesis». El mail de
arrepentimiento a los admins también usa el nombre (`apps/api/src/refunds.ts`).

## Falta (backend), Code

- **Salutación por producto.** Hoy `hasPlanFeatures()` (`apps/api/src/credits.ts`) da IA, tarjeta
  y salutación a cualquiera con plan o créditos comprados. Ahora Satoshi trae IA y tarjeta pero no
  salutación. Propuesta: `productos.saludo boolean` (false en `pack10` y `bienvenida`), que la API
  lo mande en `/api/productos`, y que la salutación se habilite si la cuenta tiene un plan vigente
  o compró alguna vez un producto con `saludo`. Cuando llegue de la API, `precios.tsx` debe leerlo
  en `contenido()` en vez de `p.base.saludo`.
- Revisar que la compra de `anual` sin plan acredite 30 regalos y 3 listas (`lista_otras`) como
  movimientos, igual que los packs.
- Textos fuera de Precios que digan «Timechain», «anual» o «1 año» para este producto (ahora Hodler).
- Quedan sin uso las claves `precios.todoLoDe`, `precios.v.siempre` y `precios.v.vistaPrevia`:
  borrarlas si nada más las usa.

## Cómo quedó (Code, 21/10)

- Migración `021_hodler_y_saludo.sql` (la 020 es la de admins): `anual` sin plan ni vencimiento
  y `productos.saludo` (false en `pack10` y `bienvenida`).
- La API manda `saludo` en `/api/productos` y `conSaludo` en `/api/cuenta/creditos`
  (`hasGreetings()`: plan vigente o algún pago confirmado de un producto con salutación). La web
  ofrece los mensajes de ejemplo solo con `conSaludo`; IA y tarjeta siguen con `conPlan`.
- Probado: la compra de `anual` acredita 30 regalos y 3 listas como créditos, sin plan.
- No quedaban textos con «Timechain» fuera de las claves de Precios. Se borraron las tres claves sin uso.
- Genesis en el celular: quedó como estaba («Quedan N lugares» arriba) hasta que se confirme lo ABIERTO.

## ABIERTO

- Genesis, punto 5 de Rodolfo («en vez de poner el monto ahí pones (solo 21)»): se interpretó
  como «Solo 21» fijo arriba y los lugares que quedan debajo del botón. Confirmar.
