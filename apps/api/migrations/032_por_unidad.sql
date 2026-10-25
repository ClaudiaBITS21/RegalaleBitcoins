-- Venta por unidad (Claudia, 25/10): un regalo suelto a 2.100 sats y una lista suelta a 10.500.
-- La lista suelta es «lista_otras» (una lista de cualquier ocasión), que hasta ahora existía solo
-- para dar listas como crédito. Como Satoshi, no traen la salutación automática.
insert into productos (codigo, precio_cents, precio_sats, regalos, listas_cumple, listas_otras, plan, saludo)
values ('regalo', 0, 2100, 1, 0, 0, null, false)
on conflict (codigo) do update set precio_sats = excluded.precio_sats, regalos = 1, activo = true;
update productos set precio_sats = 10500, regalos = 0, listas_otras = 1, saludo = false, activo = true where codigo = 'lista_otras';
