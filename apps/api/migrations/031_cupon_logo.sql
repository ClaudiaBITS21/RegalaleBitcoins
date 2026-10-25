-- Logo de quien promueve un cupón (Claudia, 25/10): una empresa o un evento. Va en el cupón del
-- link corto, al lado del de Regalale Bitcoin. Lo prepara el navegador del admin (sin fondo,
-- recortado) y llega como PNG.
create table cupones_logos (
  codigo text primary key references cupones (codigo) on delete cascade,
  datos  bytea not null check (length(datos) between 100 and 300000),
  creado timestamptz not null default now()
);
