-- Listas de regalos: quien recibe carga la llave pública (zpub/vpub) de su billetera y cada
-- invitado recibe una dirección propia, derivada de esa llave. La plataforma nunca tiene
-- claves privadas: la plata va directo a la billetera de quien armó la lista.

create table listas (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  red           text not null check (red in ('mainnet', 'testnet', 'signet', 'regtest')),
  usuario_id    uuid not null references usuarios (id) on delete restrict,
  xpub          text not null check (length(xpub) between 100 and 120),
  titulo        text not null check (length(titulo) between 1 and 60),
  ocasion       text not null,
  ocasion_libre text check (length(ocasion_libre) between 1 and 40),
  mensaje       text not null default '' check (length(mensaje) <= 500),
  fecha         date,
  idioma        text not null check (idioma in ('es', 'pt', 'en', 'it')),
  creada        timestamptz not null default now(),
  cerrada       timestamptz
);

create index listas_usuario on listas (usuario_id);

create table aportes (
  id              bigserial primary key,
  lista_id        text not null references listas (id) on delete cascade,
  indice          integer not null check (indice >= 0),
  direccion       text not null unique,
  nombre          text check (length(nombre) between 1 and 80),
  mensaje         text not null default '' check (length(mensaje) <= 500),
  moneda          text not null check (moneda in ('USD', 'ARS', 'SAT')),
  monto           numeric(14, 2) not null,
  sats_declarados bigint not null check (sats_declarados > 0),
  usd_por_btc     numeric(14, 2),
  -- Link privado del invitado para ver su aporte: se guarda solo el hash.
  token_hash      bytea not null unique,
  creado          timestamptz not null default now(),
  pagado          timestamptz,
  -- Índice salteado porque su dirección ya tenía movimientos fuera de la lista.
  externa         boolean not null default false,
  unique (lista_id, indice)
);
