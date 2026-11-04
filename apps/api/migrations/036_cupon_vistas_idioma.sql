-- La imagen del cupón para la vista previa del link, una por idioma (Claudia, 04/11/2026): el admin
-- elige en qué idioma comparte el cupón (es, en, pt, it) y el link lleva ?l=… Las de antes son en
-- castellano.
alter table cupones_vistas add column idioma text not null default 'es' check (idioma in ('es', 'en', 'pt', 'it'));
alter table cupones_vistas drop constraint cupones_vistas_pkey;
alter table cupones_vistas add primary key (codigo, idioma);
