-- Mostrar o no el valor en plata a quien recibe (Claudia, 25/10): quien regala elige. Los regalos
-- que ya existían lo siguen mostrando (como hasta ahora); la web nueva lo manda apagado de entrada.
alter table regalos add column mostrar_valor boolean not null default true;
