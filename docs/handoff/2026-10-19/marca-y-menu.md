# Handoff 19/10/2026: nombre de marca y menú

Estado: PENDIENTE

Decidido por Rodolfo en chat, 19/10/2026. Copiado de la carpeta de Drive «RegalaleBitcoin -
handoffs» (`2026-10-19 - marca y menú.md`).

## 1. Nombre de marca

- Se escribe **separado, en itálica y en naranja**: *Regalale Bitcoin*. Reemplaza a "RegalaleBitcoin" (junto), definido el 17/10.
- El dominio no cambia: `regalalebitcoin.com`. Los IDs de infraestructura (`regalalebitcoins`) tampoco.
- **Color:**
  - El naranja de marca #FF8A1F no llega al contraste mínimo sobre fondo claro (2,3:1), así que para texto se usan dos tonos de la misma familia:
  - `--marca-titulo: #D96400` en títulos grandes (3,5:1).
  - `--marca-texto: #B85300` en texto corrido, en negrita (4,8:1).
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
