-- Planes de Rodolfo (20/10/2026): Satoshi (pack10), Node Runner (pack10_lista), Timechain (anual)
-- y Genesis Block (fundador). Los valores y límites pueden cambiar: salen de productos y los edita
-- el admin. Un plan comprado guarda lo que incluía al pagarse (en planes), aunque después cambie.

-- En un producto con plan, regalos y listas_* son el cupo del plan (no créditos sueltos).
alter table productos add column regalos_libres boolean not null default false;
alter table productos add column dias integer check (dias > 0);      -- vigencia del plan; null = para siempre
alter table productos add column cupo integer check (cupo >= 0);     -- cuántos se venden; null = sin límite

update productos set regalos = 30, listas_otras = 3, dias = 365 where codigo = 'anual';
update productos set regalos_libres = true, listas_otras = 10, cupo = 21 where codigo = 'fundador';
-- La lista de cumpleaños suelta deja de venderse: Node Runner trae una lista para cualquier ocasión.
update productos set activo = false where codigo = 'lista_cumple';

alter table planes add column regalos integer check (regalos >= 0);  -- cupo de regalos; null = libres
alter table planes add column listas integer not null default 0 check (listas >= 0);
-- Los planes que ya existían (solo de prueba) quedan como eran: regalos y listas libres.
