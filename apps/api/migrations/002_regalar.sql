-- Etapa 4: el que regala crea el regalo antes de pagarlo.
-- sats_esperados: lo que eligió regalar; con eso se avisa si llegó menos o más.
alter table regalos add column sats_esperados bigint check (sats_esperados > 0);
