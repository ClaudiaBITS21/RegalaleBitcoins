-- Denuncias sin el mail de quien denuncia (Claudia, 08/11/2026): alcanza con saber si la misma
-- persona ya denunció esa lista. Se guarda una huella SHA-256 de lista + mail; distinta en cada
-- lista, así no se puede seguir a alguien de una lista a otra.
alter table denuncias add column email_hash bytea;
update denuncias set email_hash = sha256(convert_to('denuncia:' || lista_id || ':' || email, 'UTF8'));
alter table denuncias alter column email_hash set not null;
alter table denuncias drop constraint denuncias_lista_id_email_key;
alter table denuncias drop column email;
alter table denuncias add constraint denuncias_lista_email unique (lista_id, email_hash);
