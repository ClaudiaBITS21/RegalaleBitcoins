# Handoff 21/10/2026: listas por país, dato de cobro cifrado y denuncias

Estado: EN CURSO. Secciones 1 a 5 INTEGRADAS (PR «Listas por país: dato de cobro cifrado y
moneda de la lista»); sección 6 (denuncias y pausa escalonada) en el PR siguiente. Tarea 1
(`docs/operacion.md`) en el PR «docs/operacion.md y test de la regla 3».

Decidido por Rodolfo en chat (Cowork), 21/10/2026. Reglas que aplican: `docs/operacion.md`
(regla 5). Lo marcado **ABIERTO** se consulta antes de implementar.

## 1. Países y medios de cobro

Las listas aceptaban solo un alias argentino y montos en pesos. Pasa a depender del país de la
cuenta del dueño, que él elige al armar la lista (no se deduce de la IP ni del idioma).

| País | Medio | Dato que carga el dueño | Moneda |
|---|---|---|---|
| Argentina | Transferencia | Alias, o CBU/CVU (22 dígitos, con dígitos verificadores) | ARS |
| Brasil | PIX | Llave PIX: correo, celular o llave aleatoria | BRL |
| Colombia | Bre-B | Llave: celular, correo o alfanumérica | COP |
| Zona euro | SEPA | IBAN (validar mod 97) | EUR |
| Otro | Texto libre | Lo que use el dueño (hasta 120 caracteres) | La que elija (ISO 4217) |

- No se ofrecen CPF/CNPJ como llave PIX ni cédula como llave Bre-B (exponen el número fiscal o
  de documento a todos los que tengan el link), ni datos de ACH en EE. UU. Aviso: "Usá correo,
  celular o una llave aleatoria: tu número de documento lo vería cualquiera que tenga el link".
- El titular es obligatorio en todos los casos.
- Toda la validación se hace en el navegador del dueño, antes de cifrar.
- **ABIERTO:** México (SPEI, CLABE), EE. UU. (Zelle), Chile, Perú y Uruguay. Por ahora van por "Otro".
- Más adelante (no ahora): QR estándar de PIX (BR Code) y de SEPA (EPC).

## 2. Dato de cobro cifrado (la plataforma no lo puede ver)

- Clave al azar de 32 bytes en el navegador del dueño; `{ medio, dato, titular }` con
  AES-256-GCM, con el id de la lista como dato asociado (AAD).
- El servidor guarda solo el cifrado y, en claro, país y moneda.
- La clave viaja en el fragmento del link: `regalalebitcoin.com/l/<id>#<clave>`.
- El servidor entrega el cifrado solo en la respuesta de "anunciar transferencia".
- El link privado del aporte suma la clave: `/aporte#<token>.<clave>`.
- Los mails nunca incluyen el dato de cobro.
- Dónde guarda la clave el dueño: el link completo al crear la lista ("Guardalo: es la única
  forma de ver tus datos de cobro en la lista"); con bóveda, también en la cuenta; sin bóveda, en
  el navegador; en otro dispositivo, pegando el link completo. Si la pierde, vuelve a cargar el
  dato (clave y link nuevos; el link viejo sigue sirviendo para bitcoin).
- Soporte y admin no ven el dato.
- Listas con alias en claro (migración 007): siguen funcionando; a su dueño se le pide volver a
  cargarlo y al hacerlo se borra el alias en claro. **ABIERTO:** plazo para borrar los alias en
  claro que nadie re-cargue.
- Formato documentado en `docs/arquitectura.md`, con un vector de prueba.

## 3. Moneda de la lista y tandas

- `transferencias.monto` en la unidad menor de la moneda de la lista; formato con `Intl`.
- La tanda reparte en proporción al monto; una lista tiene una sola moneda.
- Los sats de un aporte se muestran como declaración del dueño (regla 5).

## 4. Textos

Al armar la lista y al invitado, los de la sección 4 del handoff (en es con vos y con tú, pt, en
e it). El aviso a bancos de la guía del dueño es genérico. Ningún texto dice que "verificamos"
listas. Términos y condiciones: revisión del abogado.

## 5. Comprobante de transferencia: no

No se suben comprobantes, ni cifrados. La conciliación es con el código `RB-XXXX` y el monto.

## 6. Denuncias y pausa escalonada (pendiente: PR siguiente)

Botón "Reportar esta lista" al pie de toda lista pública; primera denuncia pausa en el acto y
oculta dato de cobro, dirección y QR; el dueño puede reactivarla una sola vez; una denuncia
después de esa reactivación la deja en revisión hasta que la vea un admin. Una denuncia por mail
y por lista; límite por IP. Los aportes anunciados no cambian. Tabla `denuncias`; en `listas` el
estado (`activa` | `pausada` | `en_revision` | `baja`) y si ya usó su reactivación. Admin:
sección "Denuncias" con Reactivar y Dar de baja, con passkey y en `registro_admin`.

## Cómo quedó (Code, 21/10)

- Migración `025_listas_por_pais.sql`: `listas.pais`, `moneda`, `cobro` (cifrado),
  `clave_cifrada` (clave envuelta con la clave maestra); `transferencias.monto` en la unidad
  menor (las viejas se migran de `monto_ars` a centavos).
- API: `POST /api/cuenta/listas/:id/cobro` (cifrado y clave envuelta; borra el alias en claro;
  la moneda no cambia si ya hay transferencias). Anunciar y consultar devuelven el cifrado.
- Web: `lists/cobro.ts` (cifrado, vector de prueba), `lists/medios.ts` (validaciones),
  `lists/CobroFields.tsx`; «Mis listas» muestra el link completo y deja volver a cargar el dato.
- La clave de la lista se guarda en la cuenta envuelta con una llave derivada de la clave
  maestra (HKDF), en vez de dentro de la bóveda: misma propiedad (el servidor no la puede abrir)
  sin cambiar el formato de la bóveda.
