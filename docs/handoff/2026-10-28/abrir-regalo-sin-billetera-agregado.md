# Handoff 28/10/2026 (agregado): abrir un regalo sin billetera

Estado: PENDIENTE

Se suma a «2026-10-25 - abrir regalo sin billetera.md» (que todavía no está en el repo: pasar los
dos a `docs/handoff/2026-10-25/` y `docs/handoff/2026-10-28/`). Cierra su único punto ABIERTO.
Decidido por Rodolfo en Cowork, 28/10/2026.

## Regalo cargado en sats (sección 1, «Hoy vale»)

Texto (es, vos y tú igual):

> Son {sats} sats. Valor de hoy: unos USD {usd}.

- En sats no se usa «Valía / Hoy vale»: el número de sats no cambia, solo su valor en dólares.
- `{sats}` y `{usd}` con `Intl.NumberFormat` según el idioma (`apps/web/src/format.ts`).
- Si falla la cotización: solo «Son {sats} sats.».
- Adaptar a pt/en/it con el mismo sentido.

Con esto el handoff del 25/10 queda sin nada ABIERTO. Las capturas de BlueWallet (sección 3) las
pasa Rodolfo; hasta entonces la guía va sin imágenes, como dice ese handoff.
