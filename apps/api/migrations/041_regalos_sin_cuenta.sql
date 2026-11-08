-- Regalos desvinculados de la cuenta (Claudia, 08/11/2026; docs/derivacion.md, «Lista de regalos»).
-- La lista de regalos de cada cuenta se guarda cifrada con su clave maestra (`lista_regalos`): el
-- servidor no sabe qué regalos son de quién. El vínculo regalos.usuario_id dura hasta que el pago
-- del regalo queda resuelto; después el navegador lo borra y queda solo el hash de la llave de
-- edición, con la que quien regala prueba que es suyo.
alter table usuarios add column lista_regalos text check (lista_regalos is null or (lista_regalos ~ '^l1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$' and length(lista_regalos) <= 300000));
-- Contadores de la cuenta (para el próximo índice, la estadística y el aviso genérico).
alter table usuarios add column proximo_indice integer not null default 0 check (proximo_indice >= 0);
alter table usuarios add column regalos_hechos integer not null default 0 check (regalos_hechos >= 0);
alter table usuarios add column ultimo_regalo timestamptz;
-- Cuántos regalos sin abrir vio el navegador la última vez, y desde cuándo ese número no cambia.
alter table usuarios add column pendientes integer not null default 0 check (pendientes >= 0);
alter table usuarios add column pendientes_desde timestamptz;
alter table usuarios add column aviso_generico timestamptz;

update usuarios u set
  proximo_indice = coalesce((select max(indice) + 1 from regalos r where r.usuario_id = u.id), 0),
  regalos_hechos = (select count(*) from regalos r where r.usuario_id = u.id and r.descartado is null),
  ultimo_regalo = (select max(creado) from regalos r where r.usuario_id = u.id);

alter table regalos add column llave_edicion text check (llave_edicion is null or llave_edicion ~ '^[0-9a-f]{64}$');

-- Tope diario aparte de los regalos: solo vive 24 horas (lo borra la tarea programada). Mientras el
-- regalo sigue vinculado, `ref` es su id; al desvincularlo pasa a un hash de la llave de edición.
create table topes_diarios (
  usuario_id uuid not null references usuarios (id) on delete cascade,
  red        text not null,
  ref        text not null,
  usd        numeric not null check (usd >= 0),
  creado     timestamptz not null default now(),
  primary key (usuario_id, ref)
);
create index topes_diarios_creado on topes_diarios (creado);

insert into topes_diarios (usuario_id, red, ref, usd, creado)
select usuario_id, red, id,
  case when moneda = 'USD' and monto is not null then monto else coalesce(sats_esperados, 0)::numeric / 1e8 * coalesce(usd_por_btc, 0) end,
  creado
from regalos where usuario_id is not null and descartado is null and creado > now() - interval '24 hours';

-- Los movimientos siguen siendo solo de alta, con una única excepción: al desvincular un regalo,
-- su referencia (el id del regalo) pasa a la referencia ciega «d:…» y la hora se redondea al día.
-- Cualquier otro cambio sigue rechazado.
create or replace function movimientos_sin_cambios() returns trigger language plpgsql as $$
begin
  if old.tipo in ('consumo', 'devolucion') and old.referencia is not null and old.referencia !~ '^d:'
     and new.referencia ~ '^d:[0-9a-f]{64}$' and new.creado = date_trunc('day', old.creado)
     and (new.id, new.usuario_id, new.tipo, new.unidad, new.cantidad, new.origen, new.ocasion, new.motivo)
         is not distinct from (old.id, old.usuario_id, old.tipo, old.unidad, old.cantidad, old.origen, old.ocasion, old.motivo) then
    return new;
  end if;
  raise exception 'movimientos: solo se agregan, nunca se editan';
end $$;
