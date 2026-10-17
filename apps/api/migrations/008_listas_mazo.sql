-- Para quién es la lista ({nombres} en los mensajes de ejemplo), si es de una persona o de
-- varias, y el turno del mazo de ejemplos: cada invitado recibe el siguiente.
alter table listas
  add column para text check (length(para) between 1 and 60),
  add column varios boolean not null default false,
  add column mazo integer not null default 0;
