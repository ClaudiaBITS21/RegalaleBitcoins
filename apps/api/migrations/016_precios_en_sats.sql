-- Precios en sats (decisión de la responsable, 20/10/2026): se paga exactamente eso, sin cotización
-- que venza ni desvío entre lo cotizado y lo recibido. El valor en dólares se muestra solo como
-- referencia. precio_cents queda por los pagos ya hechos.
alter table productos add column precio_sats bigint not null default 0 check (precio_sats >= 0);
update productos set precio_sats = case codigo
  when 'pack10' then 10500
  when 'pack10_lista' then 21000
  when 'lista_cumple' then 10500
  when 'lista_otras' then 21000
  when 'anual' then 42000
  when 'fundador' then 210000
  else 0 end;
-- En los pagos, precio_cents pasa a ser solo el equivalente en dólares del momento (referencia).
alter table pagos drop constraint pagos_precio_cents_check;
alter table pagos add constraint pagos_precio_cents_check check (precio_cents >= 0);
