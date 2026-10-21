-- Precios del 21/10/2026 (handoff «precios y admin»): Timechain pasa a llamarse Hodler y no vence;
-- son 30 regalos y 3 listas como créditos, igual que los packs (el código sigue siendo «anual»).
-- Los planes anuales ya comprados conservan lo que tenían (están en planes).
update productos set plan = null, dias = null where codigo = 'anual';

-- La salutación automática va por producto: Satoshi (pack10) trae imagen con IA y tarjeta, pero no
-- la salutación; lo gratis tampoco.
alter table productos add column saludo boolean not null default true;
update productos set saludo = false where codigo in ('pack10', 'bienvenida');
