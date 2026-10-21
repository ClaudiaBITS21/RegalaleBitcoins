-- Copias extra de la bóveda de una passkey (Claudia, 21/10). La misma passkey, usada desde la
-- compu escaneando el QR con el celu, puede dar otra salida PRF que en el celu donde se creó, y
-- la bóveda no abre. Con las 12 palabras, el navegador guarda otra copia cifrada con esa salida.
-- Acá solo hay cajas cifradas: la clave maestra nunca llega al servidor.
alter table sesiones add column credencial text references credenciales (id) on delete cascade;
create table bovedas_extra (
  credencial_id  text not null references credenciales (id) on delete cascade,
  boveda         text not null check (length(boveda) between 20 and 400),
  creada         timestamptz not null default now(),
  primary key (credencial_id, boveda)
);
