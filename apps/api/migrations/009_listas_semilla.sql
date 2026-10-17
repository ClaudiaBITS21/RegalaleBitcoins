-- Listas armadas con "Semilla nueva" (12 palabras generadas en el navegador). Las de billetera
-- propia (cold wallet) no tienen tope por aporte; las de semilla nueva, el de los regalos.
alter table listas add column semilla boolean not null default false;
