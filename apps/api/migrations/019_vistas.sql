-- Imagen para compartir el link de un regalo (Rodolfo, 21/10): la arma el navegador al crear el
-- regalo (la ilustración de la tarjeta, el nombre y la ocasión) y la usan WhatsApp y las redes
-- como vista previa del link. Solo JPEG, nunca cambia.
create table vistas (
  regalo_id  text primary key references regalos (id) on delete cascade,
  datos      bytea not null check (octet_length(datos) between 1000 and 400000),
  creada     timestamptz not null default now()
);
