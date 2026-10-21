-- Denuncias y pausa escalonada de listas (handoff 2026-10-21, «listas por país», sección 6).
-- Primera denuncia: la lista se pausa en el acto (no muestra datos para aportar). Su dueño la
-- puede reactivar una sola vez. Una denuncia después de esa reactivación la deja en revisión
-- hasta que la vea un admin. Una denuncia por mail y por lista; la IP se guarda con hash.
alter table listas
  add column estado text not null default 'activa' check (estado in ('activa', 'pausada', 'en_revision', 'baja')),
  add column reactivada timestamptz;

create table denuncias (
  id        bigserial primary key,
  lista_id  text not null references listas (id) on delete cascade,
  email     text not null check (email = lower(email) and length(email) between 3 and 254),
  motivo    text not null check (length(motivo) between 1 and 500),
  ip_hash   bytea not null,
  creada    timestamptz not null default now(),
  unique (lista_id, email)
);
create index denuncias_lista on denuncias (lista_id);
