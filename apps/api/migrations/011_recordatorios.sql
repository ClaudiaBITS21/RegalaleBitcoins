-- Recordatorios a quien regala cuando el regalo, ya pagado, sigue sin abrirse (comparativa,
-- 19/10/2026). A quien recibe no se le escribe: la plataforma no tiene sus datos.
alter table regalos
  add column recordatorios smallint not null default 0 check (recordatorios between 0 and 2),
  add column ultimo_recordatorio timestamptz;
