-- Lo gratis editable desde el admin (Claudia, 23/10): además de cuántos regalos y listas trae la
-- bienvenida, qué servicios incluye. La imagen con IA y la tarjeta imprimible pasan a ser columnas
-- de cada producto (los pagos las traen; lo gratis, no, salvo que el admin lo cambie).
alter table productos add column ia boolean not null default true;
alter table productos add column tarjeta boolean not null default true;
update productos set ia = false, tarjeta = false where codigo = 'bienvenida';
