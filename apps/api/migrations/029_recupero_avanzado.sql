-- Recupero avanzado (handoffs del 17/10 y del 21/10/2026, docs/derivacion.md sección 10).
-- Un regalo multifirma 1-de-2 guarda su script de testigo: las dos claves públicas, la del
-- regalo y la /0/i de la billetera del que regala. Quien recibe lo necesita para firmar. Nunca
-- se guarda la xpub del que regala en claro: va cifrada en la cuenta con una clave que sale de
-- su clave maestra (formato r1.<iv>.<cifrado>), que el servidor no tiene.
alter table regalos
  add column testigo bytea check (testigo is null or length(testigo) = 71),
  -- Huella y ruta de la clave del que regala (p. ej. b8688df1/48h/1h/0h/2h/0/7): solo para
  -- decirle con qué billetera se armó el regalo.
  add column recupero_ruta text check (recupero_ruta is null or recupero_ruta ~ '^[0-9a-f]{8}(/[0-9]{1,10}h?){6}$'),
  add constraint regalos_recupero_completo check ((testigo is null) = (recupero_ruta is null));

alter table usuarios
  add column recupero text check (recupero is null or (recupero ~ '^r1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and length(recupero) <= 420));
