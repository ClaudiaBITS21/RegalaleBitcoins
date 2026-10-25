-- Estadística de altas (Claudia, 25/10): cuántas cuentas nuevas por semana, país aproximado y de
-- dónde llegaron. Solo contadores, sin relación con ninguna cuenta: no se guarda en usuarios, y por
-- semana (no por día) para que una fecha de alta no permita adivinar quién fue.
create table altas_semana (
  semana  date not null,
  pais    text not null check (pais ~ '^([A-Z]{2}|INT)$'),
  origen  text not null check (origen ~ '^[a-z0-9:._-]{1,64}$'),
  cuentas integer not null default 0 check (cuentas >= 0),
  primary key (semana, pais, origen)
);
