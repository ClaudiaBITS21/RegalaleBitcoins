-- Admins que se suman desde el panel (Rodolfo, 21/10). Los de ADMIN_EMAILS siguen siendo admins
-- fijos: no se pueden quitar desde acá. Cada alta o baja queda en registro_admin.
create table admins (
  email        text primary key check (email = lower(email) and length(email) <= 254),
  agregado_por text not null,
  creado       timestamptz not null default now()
);
