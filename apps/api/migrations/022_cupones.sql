-- Cupones (handoff 2026-10-21, «cupones»). Un cupón da un descuento en planes, regalos o listas
-- gratis, o las dos cosas. Una vez por cuenta; uno por compra. Los créditos que da no vencen
-- (decisión de Rodolfo, 21/10).
create table cupones (
  codigo       text primary key check (codigo ~ '^[A-Z0-9]{4,20}$'),
  -- Descuento en planes (1 a 100 %); null = no da descuento.
  descuento    integer check (descuento between 1 and 100),
  -- En qué productos vale el descuento; vacío = en todos.
  productos    text[] not null default '{}',
  -- Regalos o listas gratis que recibe cada persona que lo usa.
  da_unidad    text check (da_unidad in ('regalo', 'lista_otras')),
  da_cantidad  integer check (da_cantidad between 1 and 1000),
  -- Ocasión del catálogo para la que sirven esos créditos; null = cualquiera.
  ocasion      text check (ocasion is null or ocasion ~ '^[a-z]{2,20}$'),
  desde        timestamptz not null default now(),
  hasta        timestamptz,
  max_usos     integer not null check (max_usos between 1 and 1000000),
  activo       boolean not null default true,
  nota         text not null default '' check (length(nota) <= 300),
  creado_por   text not null,
  creado       timestamptz not null default now(),
  check (descuento is not null or da_unidad is not null),
  check ((da_unidad is null) = (da_cantidad is null)),
  check (ocasion is null or da_unidad is not null),
  check (hasta is null or hasta > desde)
);

-- Cada uso: se reserva al crear el pago (1 día, como el lugar de Genesis) y se confirma al
-- confirmarse el pago. Un canje sin pago (créditos gratis o descuento del 100 %) queda usado en el acto.
create table cupon_usos (
  id          bigserial primary key,
  cupon       text not null references cupones (codigo),
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  producto    text references productos (codigo),
  pago_id     text references pagos (id),
  estado      text not null check (estado in ('reservado', 'usado', 'liberado')),
  -- Sats que se dejaron de cobrar con este uso (precio original menos lo pagado).
  resignado   bigint not null default 0 check (resignado >= 0),
  creado      timestamptz not null default now(),
  usado       timestamptz
);
-- Una vez por cuenta (un uso liberado no cuenta).
create unique index cupon_usos_una_vez on cupon_usos (cupon, usuario_id) where estado <> 'liberado';
create index cupon_usos_cupon on cupon_usos (cupon);

-- Cada pago guarda el cupón, su porcentaje y el precio original (para la facturación).
alter table pagos add column cupon text references cupones (codigo);
alter table pagos add column descuento integer check (descuento between 1 and 99);
alter table pagos add column precio_original_sats bigint check (precio_original_sats > 0);

-- Créditos con ocasión: solo sirven para regalos o listas de esa ocasión del catálogo.
alter table movimientos add column ocasion text;
