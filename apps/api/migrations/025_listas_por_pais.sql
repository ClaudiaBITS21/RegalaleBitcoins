-- Listas por país (handoff 2026-10-21, «listas por país»). El dueño elige el país; la moneda sale
-- de ahí (o la elige, en «Otro»). El dato de cobro (alias, CBU/CVU, llave PIX o Bre-B, IBAN o
-- texto libre, con su titular) se guarda cifrado por su navegador: acá solo hay el cifrado, que
-- la plataforma no puede abrir. La clave viaja en el link de la lista y, si la cuenta tiene
-- bóveda, también se guarda acá cifrada con una llave que sale de la clave maestra.
alter table listas
  add column pais text check (pais in ('AR', 'BR', 'CO', 'EU', 'XX')),
  add column moneda text check (moneda ~ '^[A-Z]{3}$'),
  add column cobro text check (length(cobro) <= 2100 and cobro ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,}$'),
  add column clave_cifrada text check (clave_cifrada ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,200}$');
alter table listas add constraint listas_moneda check ((pais is null) = (moneda is null));

-- Las listas que ya aceptaban pesos: Argentina y pesos. Su alias en claro sigue hasta que el
-- dueño lo vuelva a cargar (ABIERTO: plazo para borrar los que nadie re-cargue).
update listas set pais = 'AR', moneda = 'ARS' where alias is not null;

-- Montos en la unidad menor de la moneda de la lista (centavos de peso, de real, de euro…).
alter table transferencias add column monto bigint check (monto > 0);
update transferencias set monto = round(monto_ars * 100)::bigint;
alter table transferencias alter column monto set not null;
alter table transferencias alter column monto_ars drop not null;
