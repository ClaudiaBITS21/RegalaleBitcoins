-- Admin del cobro (handoff 2026-10-19, «cobro y créditos»).

-- Cómo se abrió cada sesión: cambiar la llave de cobro exige passkey (no alcanza un link por mail).
-- Las sesiones que ya existían no se sabe: cuentan como link.
alter table sesiones add column metodo text not null default 'link' check (metodo in ('passkey', 'link'));

-- Todo lo que hace el admin queda acá (nunca la llave entera: solo su huella).
create table registro_admin (
  id      bigserial primary key,
  email   text not null,
  accion  text not null,
  detalle text not null default '' check (length(detalle) <= 500),
  creado  timestamptz not null default now()
);
