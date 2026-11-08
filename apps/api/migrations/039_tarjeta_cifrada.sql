-- Tarjeta cifrada con el link (Claudia, 08/11/2026; docs/derivacion.md, «Tarjeta»). Para quién es,
-- de quién y el mensaje van en `tarjeta`, cifrados en el navegador; el servidor no los puede leer.
-- Los regalos de antes siguen con el texto en claro hasta que quien regala abre «Mis regalos».
alter table regalos add column tarjeta text check (tarjeta is null or (tarjeta ~ '^t1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and length(tarjeta) <= 2000));
alter table regalos alter column para drop not null;
alter table regalos drop constraint if exists regalos_para_check;
alter table regalos add constraint regalos_para_check check (para is null or length(para) between 1 and 80);
alter table regalos add constraint regalos_tarjeta_o_para check (tarjeta is not null or para is not null);
