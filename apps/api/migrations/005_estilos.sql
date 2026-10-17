-- Estilo de la tarjeta e imagen propia ("Hacela con tu IA" / "Subí tu imagen").
alter table regalos add column estilo text not null default 'ilustracion'
  check (estilo in ('ilustracion', 'mano', 'elegante', 'realista', 'propia'));

-- La imagen ya llega achicada y sin metadatos desde el navegador; acá solo se guarda.
create table imagenes (
  regalo_id  text primary key references regalos (id) on delete cascade,
  tipo       text not null check (tipo in ('image/webp', 'image/jpeg', 'image/png')),
  datos      bytea not null check (octet_length(datos) between 100 and 600000),
  creada     timestamptz not null default now()
);
