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

-- Vincular la compu con el celu (sin escribir las 12 palabras): la compu pide un vínculo y muestra
-- un QR con su clave pública (en el fragmento: el servidor no la ve); el celu, que abre la bóveda,
-- sube acá la clave maestra cifrada para esa clave. Vence a los 10 minutos y se usa una vez.
create table vinculos (
  id             text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  usuario_id     uuid not null references usuarios (id) on delete cascade,
  credencial_id  text not null references credenciales (id) on delete cascade,
  paquete        text check (length(paquete) <= 1000),
  creado         timestamptz not null default now()
);
