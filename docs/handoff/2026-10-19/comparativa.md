# Handoff 19/10/2026: página "Comparativa"

Estado: PENDIENTE

Copiado de la carpeta de Drive «RegalaleBitcoin - handoffs» (`2026-10-19 - comparativa.md`).
Los adjuntos quedaron en `docs/contenido/comparativa.es.json` y `docs/prototipos/comparativa.html`.

Sumar a la web la comparativa entre *Regalale Bitcoin* y las otras formas de regalar bitcoin. Lo decidido está decidido; lo marcado **ABIERTO**, consultarlo con Rodolfo.

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/contenido/comparativa.es.json` | **Fuente de verdad** del contenido (columnas, filas, valores, textos). Usarlo, no copiar a mano. |
| `docs/prototipos/comparativa.html` | Prototipo de referencia (diseño Confeti). Lee el JSON: servir `docs/` con un server estático. Reimplementar en el stack (Preact). |

## Dónde va

- Ruta nueva: `/comparativa` (mismo patrón que `/por-que` y `/sin-custodia` en `apps/web/src/main.tsx`).
- Menú: dentro de **Por qué bitcoin ▾** → 21 razones · Según quién lo recibe · **Comparativa** · Nuestra historia. Si el menú agrupado todavía no está hecho, enlazar desde `/por-que` (al final) y desde el pie.

## Qué tiene la página

1. Encabezado: kicker, título y bajada (del JSON).
2. Tabla: columna fija de criterios a la izquierda, columna destacada *Regalale Bitcoin* (fondo naranja, todo ✓) y 4 categorías: Gift cards custodiadas · Vouchers LN · Tarjetas físicas · Hacerlo vos. **Sin nombres de marcas.**
3. Leyenda: Sí · No · Parcial (medio círculo) = "Parcial o varía según el servicio".
4. Bloque "¿Y si se lo mando yo directo?" en dos columnas (texto y reparto de párrafos en el JSON): a la izquierda título + 2 párrafos; a la derecha, la frase en negrita (cuerpo más grande) + 2 párrafos.
5. CTA "Regalá bitcoin de verdad" → `/regalar`.
6. Pie con fecha del relevamiento y mail para correcciones.

## Reglas

- **Tabla semántica** (`<table>`, `<th scope>`), íconos con `aria-label` (Sí / No / Parcial). Texto en el HTML, nada en imágenes.
- **Responsive:** desde ~720 px entra sin scroll; debajo, scroll horizontal dentro del contenedor con la primera columna `sticky`. La página nunca scrollea de costado.
- **Marca:** *Regalale Bitcoin* separado, en itálica y en naranja (`*…*` en el JSON = `<em>`). Tokens `--marca-titulo: #D96400` (títulos) y `--marca-texto: #B85300` (texto corrido); sobre fondo naranja, tinta #1A1530. Ver handoff "2026-10-19 - marca y menú".
- i18n: `comparativa.<locale>.json` por idioma, mismo esquema. Por ahora solo `es-AR`.

## Dependencias con lo que ya existe

- **"Sin KYC"**: la bajada dice "Solo tu mail para seguir tus regalos". Hoy regalar exige cuenta con mail + passkey (paso "Guardá tu regalo"); la fila es coherente con eso. No volver a "Sin registro".
- **"Ves si lo abrió"**, **"Lo podés cancelar"**, **"No vence"**: ya existen en el producto.
- **Recordatorios:** el bloque "¿Y si se lo mando yo directo?" promete recordatorios **para quien regala y para quien recibe**. Confirmar qué manda hoy `notices.ts`. A quien recibe solo se le puede recordar si el regalo se mandó por mail (por WhatsApp no hay forma). Si no está implementado, avisar a Rodolfo antes de publicar.
- **"Listas de regalo"** y **"Diseño según la ocasión"**: confirmar que están en producción al publicar la página.
- **"Sin comisiones"**: la regla 5 de `docs/operacion.md` reserva "comisión" para la de red. Esta fila la usa para decir que **no hay** comisión sobre el regalo; el costo por servicio se paga aparte y no sale del regalo. Rodolfo lo aprobó así.

## ABIERTO

- Revisión del abogado antes de publicar (comparativa pública).
- Actualizar `relevado` en el JSON cuando se revisen los datos (cada 6 meses).
