-- Datos que no hacen falta (análisis del 08/11/2026, docs/analisis/):
-- 1. La IP de quien reporta una lista se guardaba como SHA-256 sin clave (se puede revertir probando
--    todas las IP) y nunca se usó: deja de guardarse y se borra la que había.
-- 2. La transacción firmada de un reclamo «esperar a que baje» quedaba guardada después de difundida
--    o cancelada: solo hace falta mientras espera. Se borra al salir de la espera.
alter table denuncias alter column ip_hash drop not null;
update denuncias set ip_hash = null;
alter table difusiones alter column hex drop not null;
update difusiones set hex = null where estado <> 'esperando';
