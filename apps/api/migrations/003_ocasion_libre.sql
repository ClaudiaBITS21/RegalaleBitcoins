-- Ocasión libre: cuando la ocasión no está en el catálogo, quien regala la escribe.
alter table regalos add column ocasion_libre text check (length(ocasion_libre) between 1 and 40);
