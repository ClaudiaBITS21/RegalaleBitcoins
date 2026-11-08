-- Mails cifrados (Claudia, 08/11/2026; apps/api/src/secreto.ts). El mail de las cuentas y el de los
-- cupones para un mail se guardan sellados (AES-GCM) y, para buscarlos, una huella HMAC. Las
-- claves van en `claves`, envueltas por Cloud KMS. Los mails que ya están se sellan al arrancar.
create table claves (
  nombre   text primary key,
  envuelta text not null,
  creada   timestamptz not null default now()
);
alter table usuarios add column email_huella bytea;
create unique index usuarios_email_huella on usuarios (email_huella);
-- El mail sellado cambia en cada guardado: la unicidad pasa a la huella.
alter table usuarios drop constraint usuarios_email_key;
alter table usuarios drop constraint if exists usuarios_email_check;
alter table cupones add column email_huella bytea;
drop index cupones_lote_email;
create unique index cupones_lote_email on cupones (lote, email_huella) where lote is not null and email_huella is not null;
alter table cupones drop constraint if exists cupones_email_check;
