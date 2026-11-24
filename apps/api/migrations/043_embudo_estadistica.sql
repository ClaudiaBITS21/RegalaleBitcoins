-- Embudo por campaña (Claudia, 24/11/2026): cuántas veces pasó cada paso del camino (visita, regalo
-- creado, pago visto, link abierto, regalo abierto…) por semana y por origen de la visita. Igual que
-- altas_semana: solo contadores. No hay regalo, cuenta, IP ni hora; por semana (no por día) para que
-- una fecha no permita adivinar de quién fue.
create table embudo_semana (
  semana   date not null,
  origen   text not null check (origen ~ '^[a-z0-9:._-]{1,64}$'),
  evento   text not null check (evento ~ '^[a-z_]{1,32}$'),
  cantidad integer not null default 0 check (cantidad >= 0),
  primary key (semana, origen, evento)
);
