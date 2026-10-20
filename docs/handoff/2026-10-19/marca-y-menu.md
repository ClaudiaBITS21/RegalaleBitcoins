# Handoff 19/10/2026: nombre de marca y menú

Estado: INTEGRADO EN PARTE (commit 411ce9e); falta lo que dice «Qué falta», al final.

Decidido por Rodolfo en chat, 19/10/2026. Copiado de la carpeta de Drive «RegalaleBitcoin -
handoffs» (`2026-10-19 - marca y menú.md`).

## 1. Nombre de marca

- Se escribe **separado y en naranja**: Regalale Bitcoin. **Sin itálica** (decisión de Rodolfo, 19/10: un solo énfasis, el color; ni itálica ni negrita además del naranja). Reemplaza a "RegalaleBitcoin" (junto), definido el 17/10.
- El dominio no cambia: `regalalebitcoin.com`. Los IDs de infraestructura (`regalalebitcoins`) tampoco.
- **Color:**
  - El naranja de marca #FF8A1F no llega al contraste mínimo sobre fondo claro (2,3:1), así que para texto se usan dos tonos de la misma familia:
  - `--marca-titulo: #D96400` en títulos grandes (3,5:1).
  - `--marca-texto: #B85300` en texto corrido (4,8:1, alcanza sin negrita).
  - Sobre fondo naranja, la marca va en tinta #1A1530.
- **Donde no hay itálica ni color** (asunto de mail, `<title>`, notificaciones, WhatsApp, `rpName` de la passkey, metadatos): "Regalale Bitcoin" a secas.
- **Alcance:** textos de la web (i18n), mails de Resend, tarjeta imprimible, 21 razones, página Sin custodia.
  - `MAIL_FROM` → `Regalale Bitcoin <hola@regalalebitcoin.com>`.

## 2. Menú

**Compu:**

Logo · Cómo funciona ▾ · Por qué bitcoin ▾ · Listas · Precios ‖ idioma · *Abrir un regalo* · **[Regalar]**

- **Cómo funciona ▾:** Paso a paso · Seguridad (sin custodia, `/sin-custodia`) · Preguntas frecuentes.
- **Por qué bitcoin ▾:** 21 razones (`/por-que`) · Según quién lo recibe · Comparativa (`/comparativa`) · Nuestra historia.
- **Listas** y **Precios:** links directos.
- **Abrir un regalo** (`/abrir`): link discreto junto al botón principal. Es la entrada de quien recibe.
- **Con sesión iniciada**, aparece un menú propio: Mis regalos · Mis listas · Mi plan · Mi llave de recuperación.
- **Pie:** Términos · Privacidad · Botón de arrepentimiento · Cómo operamos · Contacto · Prensa · todos los idiomas.

**Celular:** arriba, logo + [Regalar] + ☰. El menú desplegable abre con "Abrir un regalo" y muestra los grupos como secciones abiertas, sin submenús anidados.

**Regla para lo que venga:** un tema nuevo entra en un grupo existente, no como ítem nuevo arriba. Si no encaja, va al pie. Arriba, como máximo, 4 links + 2 botones.

## ABIERTO

- "Según quién lo recibe" y "Nuestra historia": si son secciones de `/por-que` (anclas) o páginas propias.
- "Precios": la página depende del handoff de cobro (2026-10-19 - cobro y créditos).

## Qué quedó (código) y qué falta

Hecho:
- Tokens `--marca-titulo` y `--marca-texto`; «Regalale Bitcoin» dentro de los textos de la web en
  naranja (`ConMarca` en `apps/web/src/ui.tsx`), en tinta sobre fondo naranja.
- Menú de compu, con los cambios que pidió Rodolfo el 19/10 (botón primero, menús después, idioma
  al final; «Recibir ▾» agrupa Abrir un regalo, las listas y Mis regalos, en lugar de «Abrir un
  regalo» y «Listas» sueltos y del menú de la cuenta): [Regalar] · Recibir ▾ (Abrir un regalo,
  Armar mi lista, Mis regalos) · Cómo funciona ▾ (Seguridad) · Por qué bitcoin ▾ (21 razones,
  Comparativa, Nuestra historia) · idioma.
- «Nuestra historia» es un ancla dentro de 21 razones (`/por-que#historia`), no una página propia
  (decisión de Rodolfo, 19/10; resuelve ese punto del ABIERTO).
- «Recibir ▾» va como botón con marco negro (tinta), sin relleno, sobre cualquier fondo, para
  diferenciarlo de [Regalar], que tiene fondo (decisión de Rodolfo, 19/10).
- Celular: logo + [Regalar] + ☰; el menú abre con «Recibir» (Abrir un regalo primero) y muestra
  los grupos como secciones abiertas, con el idioma al final.
- Pie: suma «Mis regalos» (para entrar al panel sin sesión iniciada).

Cambios de Rodolfo del 20/10:
- Un grupo del menú con una sola opción no es desplegable: va directo. Hoy «Cómo funciona» tiene
  solo Seguridad, así que arriba queda el link «Seguridad».
- El pie queda para las políticas (Términos, Privacidad, Botón de arrepentimiento, Cómo operamos,
  Contacto, Prensa). Salen «¿Por qué no podemos tocar tu regalo?» (Seguridad ya está arriba),
  «Mis regalos» (está en Recibir) y «Precios» (está arriba). Queda el botón de arrepentimiento;
  el resto se suma cuando las políticas estén escritas.
- Precios: una sola tabla comparativa con tildes y cantidades (no tarjetas sueltas).

Falta (se suma cuando exista cada cosa): Paso a paso, Preguntas frecuentes, Precios, Según quién
lo recibe, y Mi plan, Mis listas y Mi llave de recuperación (dónde van, ahora que Mis regalos está
en Recibir, a definir); en el pie, Términos,
Privacidad, Botón de arrepentimiento, Cómo operamos, Contacto y Prensa. `MAIL_FROM` es
configuración de Cloud Run (la cambia Rodolfo). La marca en la tarjeta imprimible y en los mails
va «a secas» (no tienen color).
