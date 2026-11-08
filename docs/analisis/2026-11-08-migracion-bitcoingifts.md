# Migración a BitcoinGifts

Fecha: 08/11/2026. Estado: **exploración** (no se toca mainnet hasta tener el dominio y el OK de la
responsable).

## Decisiones de la responsable (08/11/2026)

- La marca pasa a ser **BitcoinGifts** («lo más probable es que migre todo a BitcoinGifts»).
- En textos se escribe **BitcoinGifts**, todo junto, en naranja como hoy «Regalale Bitcoin»
  (opción 1 de `img/2026-11-08-bitcoingifts-textos.png`).
- Logo: **opción A** de `img/2026-11-08-bitcoingifts-logos.png`. La misma caja de regalo con la ₿,
  colores y tipografías de hoy; la palabra es BITCOIN (semibold) + GIFTS (extrabold, naranja; en
  fondo naranja, tinta).
- El dominio `bitcoingifts.com` lo tiene un amigo de la responsable.

## Pendiente fuera del código

1. Que el dominio pase a **Bull&Bear International, LLC**, con un acuerdo escrito de cesión
   (recomendación del dictamen: dominio, marca y billetera de cobro a nombre de la LLC).
2. Revisar el historial del dominio (usos anteriores, listas de spam, mails configurados).
3. Consultar al abogado si «BitcoinGifts» se puede registrar como marca (es descriptivo).
4. DNS del dominio nuevo: Firebase Hosting y Resend (SPF/DKIM para mandar mails).

## Qué cambia en el código (cuando se migre)

| Zona | Alcance aproximado |
|---|---|
| Web (`apps/web/src`) | ~240 menciones en 59 archivos, en los 5 textos (es vos/tú, pt, en, it) |
| API y mails (`apps/api/src`) | ~50 menciones; remitente y logo del mail |
| Núcleo (`packages`) | ~26 menciones en textos y comentarios |
| Documentación | ~180 menciones |
| Dominio `regalalebitcoin.com` | ~200 menciones (mails, PDFs, vista previa, herramienta sin conexión) |
| Imágenes | `marca.svg`, íconos, `mail/logo-naranja.png`, `og.jpg`, manifiestos, media kit, `cuento-navidad.pdf` |
| Reglas | `CLAUDE.md` («la dirección del sitio es siempre regalalebitcoin.com») |

## Qué NO cambia nunca

- Las etiquetas internas `regalalebitcoins/…` de `docs/derivacion.md` (HKDF de la tarjeta, la lista
  de regalos, la llave de edición, el recupero, etc.). Son parte de cómo se derivan las llaves:
  cambiarlas dejaría sin abrir los regalos ya hechos. No se ven en ningún lado.
- Los links ya entregados (`regalalebitcoin.com/r/…`, tarjetas impresas, mails): el dominio viejo
  tiene que redirigir al nuevo para siempre, conservando el `#`.

## Passkeys

Las passkeys están atadas a `regalalebitcoin.com` (rpId). Para no obligar a nadie a volver a entrar
con sus 12 palabras: publicar en el dominio viejo `/.well-known/webauthn` con el origen nuevo
(«Related Origin Requests») y seguir usando `regalalebitcoin.com` como rpId desde `bitcoingifts.com`.
Hay que probarlo en los navegadores principales antes de migrar; si alguno no lo soporta, se mantiene
la redirección al dominio viejo para entrar.

## Orden propuesto

1. Dominio a nombre de la LLC y consulta de marca (fuera del código).
2. En una rama, sin tocar mainnet: logo A, textos, mails, PDFs, imágenes y passkeys compartidas;
   probado en signet.
3. Con el dominio conectado: migración de una vez (web, API con `PUBLIC_URL` nuevo, Resend) y
   redirección permanente del dominio viejo.
