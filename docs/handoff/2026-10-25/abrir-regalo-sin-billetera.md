# Handoff 25/10/2026: abrir un regalo sin billetera

Estado: INTEGRADO (PR «Abrir un regalo sin billetera: hoy vale en su moneda y guía nueva»), salvo:
- 2: las insignias oficiales de App Store y Google Play en español van como botones de texto
  hasta tener los SVG oficiales (no se pudieron bajar desde el entorno de desarrollo).
- 3: las capturas de BlueWallet, que pasa Rodolfo.
- 5: guardar el paso en `sessionStorage`, consultado con la responsable (ver el PR).

Base: `main` 4c2e41e. Archivos: `apps/web/src/claim/ClaimPage.tsx`, `apps/web/src/i18n/es.ts` (y espejos en tu/en/pt/it), `apps/api/src/app.ts`.
Aprobado por Rodolfo el 25/10. Lo marcado **ABIERTO** se consulta antes de implementar.

## 1. "Hoy vale" en la misma moneda del regalo

Hoy `GiftCard` muestra `antes` en la moneda original (`gift.original.moneda`) pero `hoy` siempre en USD (`usdPorBtcHoy`). Ej. regalo en ARS: «Valía $50.000 cuando te lo regalaron. Hoy vale USD 41».

- La API devuelve el valor de hoy ya en la moneda del regalo: `valorHoy: { moneda, monto } | null`.
  - USD → `usdPorBtcHoy` (como ahora).
  - ARS → `arsPrice.btcArs()` (ya existe, criptoya/bitso).
  - SAT → **ABIERTO**. Propuesta: «Son {sats} sats. Hoy, unos USD {usd}.» (en sats no hay "valía/vale": el número no cambia).
- Sobre los sats recibidos (confirmados + sin confirmar), como ahora.
- **Nunca mezclar monedas en la comparación.** Si falla la cotización en ARS: mostrar solo «Hoy vale USD X», sin el «Valía».
- Cuando haya monedas nuevas (BRL, etc.), misma regla.

## 2. Guía "Creá tu billetera" (paso `guia`)

Textos nuevos (es, vos). Adaptar a tú/en/pt/it con el mismo sentido. Los nombres de botones citan la app de BlueWallet en español, que dice «cartera».

- `guia.titulo`: Creá tu billetera
- `guia.intro` (nuevo): Te lleva unos 3 minutos. Si preferís hacerlo más tarde, el regalo te espera: no vence. Y si te cuesta, pedile una mano a quien te lo regaló.
- `guia.paso1`: Bajá BlueWallet:
  - Debajo, dos insignias oficiales lado a lado: **App Store** y **Google Play** (versiones en español, sin modificar, SVG autoalojados; sin scripts ni imágenes de terceros por la CSP). En el celu, primero la del sistema del usuario; en la compu, las dos.
    - App Store: https://apps.apple.com/app/bluewallet-bitcoin-wallet/id1376878040
    - Google Play: https://play.google.com/store/apps/details?id=io.bluewallet.bluewallet
  - Debajo de las insignias, chico: `guia.otras` → «¿Ya usás otra billetera? También sirve» (link a bitcoin.org/es/elija-su-monedero, o directo a «Sí, tengo una»). **Se mueve acá desde el final.**
- `guia.paso2`: Abrila y tocá «Añadir cartera». Elegí Bitcoin y tocá «Crear».
  - Se elimina «Native SegWit» (es el valor por defecto).
- `guia.paso3` (en negrita): Te va a mostrar 12 palabras. Anotalas en papel, en orden. No les saques foto ni se las pases a nadie, tampoco a nosotros. Si perdés el teléfono, son lo único que recupera tu plata.
- `guia.distintas` (nuevo, recuadro de aviso justo debajo del paso 3): Ojo: no son las 4 palabras del regalo. Esas 4 sirven solo para abrir este regalo. Las 12 son la llave de tu billetera, para siempre.
- `guia.paso4`: Tocá «Recibir», copiá la dirección y volvé a esta página.
- `guia.anote`: Anoté mis 12 palabras en papel
- `guia.listo`: Ya tengo mi dirección

## 3. Capturas de BlueWallet

Una miniatura al lado de los pasos 2, 3 y 4 (tocar para agrandar). Cuatro capturas:
1. Pantalla inicial con «Añadir cartera».
2. Elegir Bitcoin / botón «Crear».
3. Pantalla de las 12 palabras («Tu cartera ha sido creada»), **con las palabras tapadas**.
4. Pantalla «Recibir» con la dirección **borrosa**.

- Las saca Rodolfo con el celu en español, con una billetera descartable (no usar nunca una con fondos).
- WebP, recortadas al área útil, `alt` descriptivo, `loading="lazy"`, autoalojadas en el repo.
- Si BlueWallet cambia su interfaz, se vuelven a sacar: anotar fecha y versión de la app en el nombre del archivo.
- Hasta que estén las capturas, la guía va sin imágenes.

## 4. Otros cambios de texto

- `pie`: Nunca te vamos a pedir las 12 o 24 palabras de tu billetera. (Antes: «las palabras de tu billetera», que choca con pedir las 4 del regalo.)
- `palabras.texto`: Te las dieron por otro lado: en persona, en la tarjeta o en otro mensaje. Escribilas en orden. Sirven solo para abrir este regalo.
- `confirmar.comision`: Comisión de la red: {comision}. La cobra la red de Bitcoin, no nosotros.

## 5. Ir y volver de la app (probar)

En el celu la persona sale a la tienda, instala, crea la billetera y vuelve. Los pasos viven en memoria (`useState`): si el navegador recarga la pestaña, vuelve al principio y tiene que escribir las 4 palabras de nuevo.

- Probar en iPhone (Safari) y Android (Chrome).
- Si se pierde el estado: guardar en `sessionStorage` el paso y la dirección de destino. **Nunca las 4 palabras ni nada derivado de ellas.** Al volver, pedir las 4 palabras de nuevo solo si hacen falta para firmar, con un texto que explique por qué.
