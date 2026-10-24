# Handoff 24/10/2026: la empresa detrás de Regalale Bitcoin es Bull & Bear LLC

Estado: INTEGRADO (PR «Empresa: Bull & Bear LLC en el pie y en privacidad»), salvo lo ABIERTO.

Decisión de Rodolfo, 24/10/2026: el sitio deja de figurar a nombre de Apptivalo S.R.L.
(CUIT 30-71671196-6) y pasa a **Bull & Bear LLC**, sociedad constituida en Delaware, EE.UU.

## Cambios (rama `cowork/empresa-bull-and-bear`, desde main d36f828, commit 359bdf8)

- `apps/web/src/ui.tsx` (pie legal): «© Regalale Bitcoin · Bull & Bear LLC (Delaware, EE.UU.)». Sin CUIT.
  En el JSX: `Regalale Bitcoin · Bull &amp; Bear LLC (Delaware, EE.UU.)` en lugar de
  `Regalale Bitcoin · Apptivalo S.R.L. · CUIT 30-71671196-6`.
- `apps/web/src/privacidad.tsx` («Quién es responsable»): reemplazar
  «es un servicio de Apptivalo S.R.L., CUIT 30-71671196-6, con domicilio en Marcelo T. de Alvear 405, Ciudad Autónoma de Buenos Aires (C1058AAC), responsable de los datos que se describen acá.»
  por
  «es un servicio de Bull &amp; Bear LLC, una sociedad constituida en el Estado de Delaware, Estados Unidos, responsable de los datos que se describen acá.»

Se mantienen sin cambios el botón de arrepentimiento, la leyenda de Defensa del Consumidor y la
leyenda de la AAIP: aplican porque el servicio se ofrece a consumidores en la Argentina, no por la
nacionalidad de la empresa.

## ABIERTO (consultar con Rodolfo)

- **Domicilio de Bull & Bear LLC** para la política de privacidad (registered agent en Delaware o
  dirección comercial). Hasta tenerlo, la política no muestra domicilio. La Ley 25.326 pide
  identificar al responsable; conviene completarlo pronto.
- `VERSION` en privacidad.tsx: actualizar a la fecha del deploy.

## Para Code

1. Aplicar los dos cambios (o integrar la rama si llega pusheada). Verificar typecheck y que el pie
   muestre «Bull & Bear».
2. Agregar en `docs/operacion.md`: «Operador del servicio: Bull & Bear LLC (Delaware, EE.UU.),
   desde el 24/10/2026; antes Apptivalo S.R.L.».
3. No editar `docs/handoff/2026-10-19/cobro-y-creditos.md` (histórico, menciona facturar por
   Apptivalo); la facturación del costo por servicio queda a confirmar con el contador para la LLC.

## Pendiente fuera del código

- Abogado: análisis PSAV / RG CNV 1172/2026 y Ley 25.326 (responsable extranjero, transferencia
  internacional de datos) con Bull & Bear LLC como operador.
- Contador: facturación del costo por servicio desde la LLC.
