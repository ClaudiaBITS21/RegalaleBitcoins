-- Compra en tanda: quien armó la lista compra bitcoin cuando quiere con varias transferencias
-- recibidas juntas, y los sats comprados se reparten en proporción a los pesos de cada una. Cada
-- transferencia guarda su parte (sats_convertidos) y el total de la compra para mostrarlo.
alter table transferencias
  add column tanda_sats bigint check (tanda_sats > 0),
  add column tanda_aportes integer check (tanda_aportes > 0);
