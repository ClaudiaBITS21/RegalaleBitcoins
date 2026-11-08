-- Cerrar fugas en el reclamo (handoff 2026-11-08 B2B, «Datos y privacidad»): no se guarda a qué
-- dirección fue el barrido de un regalo. Se borra lo que había.
update regalos set reclamo_destino = null where reclamo_destino is not null;
