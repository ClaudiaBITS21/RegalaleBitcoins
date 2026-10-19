-- Botón de arrepentimiento (handoff 2026-10-19, «cobro y créditos»): 10 días desde la compra, si no
-- usó ningún crédito del pack (y, en listas, si no recibió aportes). Se devuelven los mismos sats
-- pagados; la devolución la manda la responsable a mano desde su billetera y el admin la marca.

create table arrepentimientos (
  codigo                text primary key check (codigo ~ '^ARR-[A-Z0-9]{6}$'),
  pago_id               text not null unique references pagos (id),
  usuario_id            uuid not null references usuarios (id) on delete restrict,
  direccion_devolucion  text not null,
  sats                  bigint not null check (sats > 0),
  estado                text not null default 'pedido' check (estado in ('pedido', 'devuelto')),
  creado                timestamptz not null default now(),
  resuelto              timestamptz
);
