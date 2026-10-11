-- Regalos y difusiones programadas ("esperar a que baje la comisión").
-- El servidor nunca guarda la passphrase ni claves privadas.

create table regalos (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'), -- público, va en /r/<id>
  red              text not null check (red in ('mainnet', 'testnet', 'signet', 'regtest')),
  direccion        text not null unique,
  idioma           text not null check (idioma in ('es', 'pt', 'en', 'it')),
  ocasion          text not null,
  para             text not null check (length(para) between 1 and 80),
  de               text check (length(de) <= 80),
  mensaje          text not null default '' check (length(mensaje) <= 500),
  imagen           smallint not null default 1 check (imagen between 1 and 4),
  moneda           text check (moneda in ('USD', 'ARS', 'BRL', 'EUR', 'SAT')),
  monto            numeric(14, 2),
  usd_por_btc      numeric(14, 2), -- cotización al crear el regalo ("valía X")
  creado           timestamptz not null default now(),
  reclamo_txid     text unique check (reclamo_txid ~ '^[0-9a-f]{64}$'),
  reclamo_tipo     text check (reclamo_tipo in ('reclamo', 'recupero')),
  reclamo_destino  text,
  reclamado        timestamptz
);

create table difusiones (
  id         bigserial primary key,
  regalo_id  text not null references regalos (id),
  txid       text not null unique check (txid ~ '^[0-9a-f]{64}$'),
  hex        text not null,
  sat_vb     numeric(10, 3) not null,
  creada     timestamptz not null default now(),
  difundida  timestamptz,
  estado     text not null default 'esperando' check (estado in ('esperando', 'difundida', 'cancelada'))
);

create index difusiones_esperando on difusiones (estado) where estado = 'esperando';
