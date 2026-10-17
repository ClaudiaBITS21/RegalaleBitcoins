-- Listas que aceptan pesos: alias de quien recibe y transferencias anunciadas por los
-- invitados. La plataforma no ve ni mueve pesos: guarda lo anunciado y lo que marca quien
-- armó la lista (recibida, convertida).

alter table listas
  add column alias text check (alias ~ '^[a-z0-9.-]{6,20}$'),
  add column alias_titular text check (length(alias_titular) between 1 and 60);

create table transferencias (
  id               bigserial primary key,
  lista_id         text not null references listas (id) on delete cascade,
  codigo           text not null check (codigo ~ '^RB-[A-Z2-9]{4}$'),
  nombre           text check (length(nombre) between 1 and 80),
  mensaje          text not null default '' check (length(mensaje) <= 500),
  monto_ars        numeric(14, 2) not null check (monto_ars > 0),
  token_hash       bytea not null unique,
  estado           text not null default 'anunciada' check (estado in ('anunciada', 'recibida', 'convertida')),
  sats_convertidos bigint check (sats_convertidos > 0),
  creada           timestamptz not null default now(),
  actualizada      timestamptz not null default now(),
  unique (lista_id, codigo)
);
