-- Cuentas de quien regala: mail + passkeys. El servidor guarda la bóveda cifrada (la clave
-- maestra cifrada con la PRF de cada passkey) y no la puede abrir.

create table usuarios (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (length(email) between 3 and 254),
  idioma      text not null default 'es' check (idioma in ('es', 'pt', 'en', 'it')),
  verificado  timestamptz, -- cuando entró por primera vez con un link del mail
  creado      timestamptz not null default now()
);

create table credenciales (
  id             text primary key check (id ~ '^[A-Za-z0-9_-]+$' and length(id) between 16 and 1400), -- id de la passkey, base64url
  usuario_id     uuid not null references usuarios (id) on delete cascade,
  clave_publica  bytea not null, -- SPKI DER
  alg            integer not null check (alg in (-7, -8, -257)),
  contador       bigint not null default 0,
  boveda         text check (boveda ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and length(boveda) <= 500), -- null si la passkey no tiene PRF
  creada         timestamptz not null default now(),
  usada          timestamptz
);
create index credenciales_usuario on credenciales (usuario_id);

create table sesiones (
  token_hash  bytea primary key,
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  creada      timestamptz not null default now(),
  expira      timestamptz not null
);

create table desafios (
  desafio  text primary key,
  tipo     text not null check (tipo in ('registro', 'ingreso')),
  expira   timestamptz not null
);

create table enlaces (
  token_hash  bytea primary key,
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  expira      timestamptz not null,
  usado       timestamptz
);

alter table regalos
  add column usuario_id uuid references usuarios (id) on delete set null,
  add column indice integer check (indice >= 0),
  add column aviso_listo timestamptz;
create index regalos_usuario on regalos (usuario_id) where usuario_id is not null;
