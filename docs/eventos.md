# Embudo por campaña (eventos)

Pedido de la responsable, 24/11/2026: medir qué comunicación funciona, **sin reducir la
privacidad**. Sigue el mismo criterio que la estadística de altas (`altas_semana`, 25/10/2026).

## Qué se cuenta

El navegador avisa a `POST /api/eventos` con dos datos: `{ evento, origen }`. El servidor suma 1 en
`embudo_semana (semana, origen, evento, cantidad)`. Nada más.

| Evento | Cuándo | Quién |
|---|---|---|
| `visita` | Primera página de la visita (no en `/admin` ni `/cupones`) | Todos |
| `regalar_inicio` | Entra a `/regalar` | Regala |
| `regalo_creado` | El servidor aceptó el regalo y se muestra la dirección de pago | Regala |
| `pago_visto` | El servidor informa que el pago apareció en la red (sin esperar confirmación) | Regala |
| `regalo_compartido` | Toca WhatsApp, mail o copiar para el link, o baja la tarjeta | Regala |
| `compra` | Un pago de pack, plan o lista quedó confirmado | Regala |
| `link_abierto` | Se cargó un regalo desde su link | Recibe |
| `palabras_ok` | Las 4 palabras abrieron el regalo | Recibe |
| `regalo_abierto` | El barrido salió (o quedó programado) | Recibe |

`origen` es el de la visita (`apps/web/src/origen.ts`): `utm:<utm_source>`, el dominio del sitio
de donde vino, `cupon`, `regalo` (entró por el link de un regalo) o `directo`; se recuerda 7 días (ver abajo). Las filas con origen
`regalo` y eventos de quien regala muestran cuántos de los que recibieron un regalo después hicieron
uno, en la misma visita.

Se ve en el admin: «Embudo por origen de la visita (12 semanas)».

## Qué no se hace (y por qué)

- **El origen no se guarda en el regalo, en la cuenta ni en la compra.** Por eso todos los eventos
  los avisa el navegador durante la visita, y no el servidor cuando ve la cadena: para que el
  servidor pudiera contarlo tendría que recordar de qué campaña es cada regalo.
- **El aviso no lleva identificadores.** El id del regalo o de la compra se usa solo en el navegador
  (sessionStorage) para no contar dos veces el mismo paso; no viaja. La ruta no lee la sesión, la web
  manda el aviso sin cookies y el servidor ignora cualquier otro campo.
- **Lista cerrada de eventos.** Un nombre que no esté en `FUNNEL_EVENTS` se rechaza.
- **Por semana, no por día ni por hora**, para que una fecha no permita adivinar de quién fue.
- **Sin scripts ni servicios de terceros**, y sin mandar conversiones a plataformas de anuncios.
- La IP se usa en memoria para el límite (60 avisos por hora) y no se guarda.

## Límites conocidos

- **El origen se recuerda 7 días en el navegador** (decisión de la responsable, 24/11/2026: es el
  tiempo entre campaña y campaña). Lo que pase en esa semana cuenta para la campaña por la que
  llegó la persona, aunque vuelva sin el link. Otra campaña o un cupón la reemplazan y arrancan su
  semana; volver directo, desde otro sitio o por el link de un regalo no la pisa ni estira el
  plazo. Queda en `localStorage` (etiqueta y día de vencimiento) y no viaja como tal. Vale también
  para la estadística de altas. Desde otro dispositivo o navegador no se hereda.
- Cada paso se cuenta una vez por visita: quien vuelve tres veces en la semana suma tres `visita`.
- `pago_visto` y `compra` solo se cuentan si la persona tiene la página abierta cuando el pago
  aparece. Los totales exactos de regalos pagados y abiertos siguen siendo los del resto del admin,
  que salen de la cadena; el embudo sirve para comparar orígenes entre sí.
- Son avisos del navegador: alguien podría mandar avisos falsos (hasta el límite por IP). Sirven
  para comparar campañas, no para facturar ni para pagarle a nadie por resultados.
- **No usar etiquetas `utm_source` por persona** (por ejemplo, una por destinatario de un mail): una
  etiqueta que solo usa una persona vuelve identificable su contador. Una etiqueta por campaña o canal.
