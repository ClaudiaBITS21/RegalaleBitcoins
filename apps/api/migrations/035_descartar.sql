-- Descartar un regalo que nunca se pagó (Claudia, 28/10/2026): desaparece de «Mis regalos» y deja
-- de contar para el tope diario de la cuenta. Solo si su dirección nunca recibió nada; si después
-- le llega un pago igual, vuelve a aparecer (el link y las palabras siguen sirviendo para abrirlo).
alter table regalos add column descartado timestamptz;
