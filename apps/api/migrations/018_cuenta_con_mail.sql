-- Cuenta con solo el mail (Rodolfo, 20/10, opción B): quien regala sin passkey deja su mail y la
-- cuenta se crea en el momento, sin verificar (igual que con passkey). La sesión queda marcada
-- «mail»: no es un ingreso con link ni con passkey.
alter table sesiones drop constraint sesiones_metodo_check;
alter table sesiones add constraint sesiones_metodo_check check (metodo in ('passkey', 'link', 'mail'));
