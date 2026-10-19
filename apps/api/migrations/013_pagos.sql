-- Pagos del costo por servicio (handoff 2026-10-19, «cobro y créditos»). Cada pago tiene su propia
-- dirección, derivada de la llave de cobro de solo lectura (ajustes.llave_cobro); las claves están
-- en la billetera de la responsable. El servidor nunca puede mover esos fondos.

create table pagos (
  id                text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  usuario_id        uuid not null references usuarios (id) on delete restrict,
  producto          text not null references productos (codigo),
  precio_cents      integer not null check (precio_cents > 0),
  sats              bigint not null check (sats > 0),           -- cotizados
  usd_por_btc       numeric(14, 2) not null,
  llave             text not null,                              -- descriptor con el que se derivó
  indice            integer not null check (indice >= 0),
  direccion         text not null unique,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'visto', 'confirmado', 'incompleto', 'vencido', 'devuelto')),
  sats_recibidos    bigint not null default 0,
  txids             text[] not null default '{}',
  vence_cotizacion  timestamptz not null,
  visto_en          timestamptz,
  confirmado        timestamptz,
  creado            timestamptz not null default now(),
  unique (llave, indice)
);
create index pagos_usuario on pagos (usuario_id);
create index pagos_abiertos on pagos (estado) where estado in ('pendiente', 'visto', 'incompleto', 'vencido');
