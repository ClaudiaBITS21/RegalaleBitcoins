-- Cobro por servicio y créditos (handoff 2026-10-19, «cobro y créditos»). Es un costo por
-- servicio que se paga aparte: nunca sale de la dirección de un regalo ni de los aportes de una lista.

-- Ajustes que cambia el admin (por ahora, si el cobro está activo). Sin fila = valor por defecto.
create table ajustes (
  clave        text primary key,
  valor        text not null,
  actualizado  timestamptz not null default now()
);

-- Productos con su precio en centavos de dólar (editables desde el admin).
create table productos (
  codigo        text primary key check (codigo ~ '^[a-z0-9_]{2,32}$'),
  precio_cents  integer not null check (precio_cents >= 0),
  regalos       integer not null default 0 check (regalos >= 0),
  listas_cumple integer not null default 0 check (listas_cumple >= 0),
  listas_otras  integer not null default 0 check (listas_otras >= 0),
  plan          text check (plan in ('anual', 'fundador')),
  activo        boolean not null default true
);
insert into productos (codigo, precio_cents, regalos, listas_cumple, listas_otras, plan) values
  ('bienvenida', 0, 5, 0, 0, null),
  ('pack10', 1050, 10, 0, 0, null),
  ('pack10_lista', 2100, 10, 0, 1, null),
  ('anual', 4200, 0, 0, 0, 'anual'),
  ('fundador', 21000, 0, 0, 0, 'fundador'),
  ('lista_cumple', 1050, 0, 1, 0, null),
  ('lista_otras', 2100, 0, 0, 1, null);

-- Movimientos de créditos: solo se agregan. El saldo es la suma; los errores se corrigen con un
-- «ajuste», nunca editando (un trigger rechaza los UPDATE).
create table movimientos (
  id          bigserial primary key,
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  tipo        text not null check (tipo in ('otorgamiento', 'compra', 'consumo', 'devolucion', 'ajuste')),
  unidad      text not null check (unidad in ('regalo', 'lista_cumple', 'lista_otras')),
  cantidad    integer not null,
  -- 'plan': uso registrado de un plan vigente (cantidad 0, no descuenta).
  origen      text not null check (origen in ('bienvenida', 'pago', 'codigo', 'campana', 'admin', 'plan')),
  referencia  text,
  motivo      text check (length(motivo) <= 300),
  creado      timestamptz not null default now()
);
create index movimientos_usuario on movimientos (usuario_id);
-- Un regalo consume una sola vez y se devuelve una sola vez.
create unique index movimientos_una_vez on movimientos (tipo, referencia) where tipo in ('consumo', 'devolucion') and referencia is not null;

create function movimientos_sin_cambios() returns trigger language plpgsql as $$
begin
  raise exception 'movimientos: solo se agregan, nunca se editan';
end $$;
create trigger movimientos_sin_cambios before update on movimientos for each row execute function movimientos_sin_cambios();

-- Planes (anual o fundador). hasta null = para siempre (fundador).
create table planes (
  id          bigserial primary key,
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  tipo        text not null check (tipo in ('anual', 'fundador')),
  desde       timestamptz not null default now(),
  hasta       timestamptz,
  referencia  text
);
create index planes_usuario on planes (usuario_id);

-- Cuándo se resolvió el crédito de cada regalo (consumo, plan o gratis porque el cobro no estaba
-- activo). Los regalos que ya existían quedan resueltos: no consumen.
alter table regalos add column credito timestamptz;
update regalos set credito = creado;

-- Las cuentas que ya existían reciben también sus 5 regalos de bienvenida.
insert into movimientos (usuario_id, tipo, unidad, cantidad, origen, referencia)
select id, 'otorgamiento', 'regalo', 5, 'bienvenida', 'bienvenida' from usuarios;
