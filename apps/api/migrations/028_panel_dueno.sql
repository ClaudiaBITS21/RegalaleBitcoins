-- Panel del dueño de la lista (handoff 21/10/2026, «panel del dueño»): «No me llegó», compras en
-- tanda como registro propio con historial (corregir, deshacer) y totales separados.

-- «No me llegó»: estado propio, que no suma en ningún total. El invitado puede volver a avisar
-- (vuelve a anunciada, con una nota) hasta 3 veces.
alter table transferencias drop constraint transferencias_estado_check;
alter table transferencias add constraint transferencias_estado_check check (estado in ('anunciada', 'recibida', 'convertida', 'no_llego'));
alter table transferencias
  add column avisos smallint not null default 0 check (avisos between 0 and 3),
  add column nota text check (length(nota) <= 140),
  add column no_llego timestamptz;

-- Cada compra en tanda es un registro: los sats que declaró el dueño y sus transferencias.
create table compras (
  id          bigserial primary key,
  lista_id    text not null references listas (id) on delete cascade,
  sats        bigint not null check (sats > 0),
  creada      timestamptz not null default now(),
  corregida   timestamptz,
  deshecha    timestamptz
);
create index compras_lista on compras (lista_id);
alter table transferencias add column compra_id bigint references compras (id);

-- Nunca en silencio: cada cambio de una compra queda acá (solo se agregan).
create table compras_historial (
  id          bigserial primary key,
  compra_id   bigint not null references compras (id) on delete cascade,
  accion      text not null check (accion in ('creada', 'corregida', 'deshecha')),
  sats_antes  bigint,
  sats        bigint,
  creada      timestamptz not null default now()
);
create index compras_historial_compra on compras_historial (compra_id);

-- Las compras ya hechas pasan a ser registros: una por cada grupo de transferencias convertidas
-- juntas (misma lista, mismo total, misma cantidad y mismo momento).
with grupos as (
  select lista_id, tanda_sats, tanda_aportes, actualizada, min(id) as primera
  from transferencias where estado = 'convertida' and tanda_sats is not null
  group by lista_id, tanda_sats, tanda_aportes, actualizada
), nuevas as (
  insert into compras (lista_id, sats, creada)
  select lista_id, tanda_sats, actualizada from grupos order by primera
  returning id, lista_id, sats, creada
)
update transferencias t set compra_id = n.id
from nuevas n
where t.lista_id = n.lista_id and t.tanda_sats = n.sats and t.actualizada = n.creada and t.estado = 'convertida';
insert into compras_historial (compra_id, accion, sats, creada) select id, 'creada', sats, creada from compras;
