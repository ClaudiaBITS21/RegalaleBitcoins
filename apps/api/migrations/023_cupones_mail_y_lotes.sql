-- Cupones para un mail y lotes de cupones (pedido de Claudia, 21/10). Un cupón con mail solo lo
-- usa la cuenta con ese mail (si todavía no existe, cuando se cree). Un lote es un grupo de
-- cupones de un solo uso con las mismas condiciones: N códigos sueltos o uno por mail de un CSV,
-- cada uno con su link de invitación.
create table cupon_lotes (
  id          bigserial primary key,
  nombre      text not null check (length(nombre) between 1 and 80),
  creado_por  text not null,
  creado      timestamptz not null default now()
);

alter table cupones add column email text check (email is null or (email = lower(email) and length(email) between 3 and 254));
alter table cupones add column lote bigint references cupon_lotes (id);
-- Los códigos de lote llevan prefijo y 8 caracteres al azar: hasta 24 en total.
alter table cupones drop constraint cupones_codigo_check;
alter table cupones add constraint cupones_codigo_check check (codigo ~ '^[A-Z0-9]{4,24}$');
create index cupones_lote on cupones (lote) where lote is not null;
create unique index cupones_lote_email on cupones (lote, email) where lote is not null and email is not null;
