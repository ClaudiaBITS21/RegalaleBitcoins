-- Link corto de cada cupón (Claudia, 25/10): regalalebitcoin.com/c/K7M2P muestra el cupón con la
-- estética del sitio y lo deja cargado para la compra. 5 caracteres de un alfabeto sin los que se
-- confunden (0/O, 1/I/L): 31^5 ≈ 28 millones de combinaciones.
create or replace function nuevo_corto_cupon() returns text language plpgsql as $$
declare
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    exit when not exists (select 1 from cupones where corto = c);
  end loop;
  return c;
end $$;

alter table cupones add column corto text unique check (corto ~ '^[A-HJKMNP-Z2-9]{5}$');

do $$
declare r record;
begin
  for r in select codigo from cupones loop
    update cupones set corto = nuevo_corto_cupon() where codigo = r.codigo;
  end loop;
end $$;

alter table cupones alter column corto set default nuevo_corto_cupon(), alter column corto set not null;

-- La imagen del cupón para la vista previa del link (WhatsApp, redes): la arma el navegador del
-- admin la primera vez que copia o comparte el cupón (como la de los regalos, share.ts).
create table cupones_vistas (
  codigo text primary key references cupones (codigo) on delete cascade,
  datos  bytea not null check (length(datos) between 1000 and 400000),
  creada timestamptz not null default now()
);
