# Esquema de derivación de un regalo

Este documento fija cómo se generan las claves de un regalo. Es la base técnica de la
guía de recuperación: con esto, cualquiera puede recuperar un regalo sin la plataforma.
**No se puede cambiar una vez que existan regalos en mainnet.** El código está en
`packages/core` y los tests de regresión fijan cada paso.

## 1. Clave maestra del que regala

- 128 bits de `crypto.getRandomValues` → mnemónico BIP39 de **12 palabras en inglés**.
- Semilla BIP39 **sin passphrase** → clave raíz BIP32.
- Estas 12 palabras son también el **código de recuperación**. Importadas en una
  billetera muestran saldo cero, porque los fondos de los regalos viven en las claves
  derivadas con BIP85, no en la billetera BIP84 de la clave maestra.

## 2. El regalo número `i`

Desde la raíz de la clave maestra, con BIP85 (versión 2.1.0):

| Parte | Derivación | Resultado |
|---|---|---|
| Semilla | aplicación BIP39, inglés, 12 palabras: `m/83696968'/39'/0'/12'/{i}'` | 16 bytes → 12 palabras en inglés |
| Passphrase | aplicación HEX, 16 bytes: `m/83696968'/128169'/16'/{i}'` | primeros 44 bits → 4 palabras |

**De bits a palabras.** Los primeros 44 bits de la salida HEX, en big endian, se
parten en 4 números de 11 bits. Cada número es una posición (0–2047) en la lista
BIP39 oficial del idioma del que recibe: castellano, portugués, inglés o italiano.

**Forma canónica de la passphrase.** Cada palabra se pasa a NFKD, se le quitan las
marcas diacríticas y se pone en minúsculas. Las 4 palabras se unen con un espacio
simple. Solo afecta al castellano, la única de las cuatro listas con tildes (334
palabras): "ábaco" → `abaco`. El resultado es siempre ASCII, así que funciona en
billeteras que no normalizan Unicode o que solo aceptan ASCII. Ninguna lista queda
ambigua al quitar las tildes; hay un test que lo verifica.

**Por qué la passphrase se deriva y no se sortea.** Así la clave maestra (el código de
recuperación) alcanza para recuperar cualquier regalo no reclamado. Para quien no
tiene la clave maestra, son 44 bits uniformes, igual que si se sortearan. La
passphrase usa una aplicación BIP85 distinta de la semilla. Si saliera de la
aplicación BIP39 con el mismo índice, para un receptor en inglés serían las primeras
4 palabras de la semilla del regalo.

## 3. La billetera del regalo

- Semilla BIP39 = PBKDF2(12 palabras del regalo, "mnemonic" + passphrase canónica).
- BIP84 (segwit nativo, P2WPKH), primera dirección de recepción:
  - mainnet: `m/84'/0'/0'/0/0` (`bc1q…`)
  - signet/testnet: `m/84'/1'/0'/0/0` (`tb1q…`)

Unas palabras equivocadas abren otra billetera válida y vacía, sin error. La interfaz
compara la dirección derivada con la registrada y, si no coinciden, dice: "No
encontramos fondos con esas palabras, revisalas."

## 4. El link

```
https://regalalebitcoin.com/r/<id>#1<base64url sin relleno (semilla[16] ‖ sha256(semilla)[0..2])>
```

- `<id>` es aleatorio y solo sirve para que el servidor muestre la tarjeta.
- Lo que va después del `#` nunca llega al servidor. Son 25 caracteres: la versión
  (`1`) y 24 de base64url.
- Los 2 bytes de control detectan un link cortado o mal copiado antes de pedir las
  palabras.
- La passphrase nunca va en el link: viaja por otro canal.

## 5. El barrido

Lo arma y lo firma el navegador:

- **Entradas:** todos los UTXO de la dirección del regalo. El monto de cada uno se lee
  de la transacción completa que lo creó, después de verificar que su hash coincide
  con el txid. No se confía en montos que informe un servidor.
- **Salida:** una sola, a la dirección del que recibe (o del que regala, si lo
  recupera). Se aceptan P2WPKH, P2WSH, P2TR, P2PKH y P2SH. Las versiones futuras de
  segwit se rechazan.
- **Transacción:** versión 2, locktime 0. Todas las entradas llevan nSequence
  `0xfffffffd` (señala RBF, para poder acelerar si queda trabada).
- **Comisión:** `ceil(vsize × tasa)`. El vsize se estima con firmas de 72 bytes, el
  peor caso, y se firma con low-R, así que la transacción real nunca pesa más que lo
  estimado.
  - La tasa va de 0,1 a 1000 sat/vB.
  - La comisión sale del monto: la paga el que recibe.
- **Dust:** si después de la comisión queda menos que el umbral de dust de Bitcoin
  Core para ese tipo de salida, no se arma la transacción y se explica por qué.
  - P2WPKH: 294 sats.
  - P2TR y P2WSH: 330 sats.
  - P2SH: 540 sats.
  - P2PKH: 546 sats.

## 6. Recuperación sin la plataforma

**El que recibe, o cualquiera con link y palabras.**
1. Decodificar el fragmento del link y pasar los 16 bytes a 12 palabras BIP39 en inglés.
2. En una billetera que admita passphrase (Sparrow, Electrum), importar las 12 palabras
   con la passphrase en forma canónica: minúsculas, sin tildes, un espacio entre
   palabras.
3. Elegir segwit nativo (BIP84).

**El que regala, con solo el código de recuperación.**
1. Para `i = 0, 1, 2, …`, derivar la semilla y la passphrase del regalo `i`.
2. Probar los 4 idiomas y consultar el saldo de cada dirección.
3. Cortar después de una racha larga de índices sin uso: los regalos que nunca se
   pagaron dejan huecos.

## 7. Ejemplo

Con la clave raíz de prueba de BIP85
(`xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb`),
regalo `0`:

- Semilla: `girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose`.
  Es el vector oficial BIP85 de 12 palabras, porque el path coincide.
- Passphrase y dirección en signet:

| Idioma | Passphrase | Dirección en signet |
|---|---|---|
| es | `cuerda cuento nuez cuento` | `tb1qy9nq3wd36d6gd06y7sx8s07dz2fc3wuaf3jehy` |
| pt | `colono colmeia mesclar colmeia` | `tb1qyru6njz2apxcvh2djpdqgrhucn2zdp5y0pmnsy` |
| en | `detect detail outside detail` | `tb1qljtn76nmu5nspy998qc8r676nwx36h76npqd60` |
| it | `dipinto dinnanzi periodo dinnanzi` | `tb1qqg83zxwvst72j297jwslwex3pzzjsnj3xp9teg` |

## 8. Seguridad de los 44 bits

La passphrase protege al regalo de terceros que vean el link, no del que regala. Sin
el link no hay nada que atacar. Con el link (interceptado, o robado de un servidor que
lo guardó para un envío programado), romper la passphrase por fuerza bruta implica
probar en promedio 2⁴³ passphrases. Cada prueba cuesta un PBKDF2-HMAC-SHA512 de 2048
iteraciones. Estimación gruesa a octubre de 2026: unas 1.500 horas de GPU de gama alta
por regalo, del orden de USD 500 a 1.000. No escala: cada regalo tiene otra semilla.
Con el techo de USD 100 de la beta no conviene. Si el techo sube, hay que revisarlo.

## 9. Bóveda

La clave maestra se guarda cifrada con la extensión PRF de una passkey (WebAuthn). Solo
el navegador, con la passkey, la puede abrir.

- **Salt PRF:** `SHA-256("regalalebitcoins/boveda/v1/prf")`, el mismo para todas las cuentas.
- **Clave:** `HKDF-SHA256(salida PRF, salt vacío, info "regalalebitcoins/boveda/v1/aes-gcm")`,
  32 bytes.
- **Cifrado:** AES-256-GCM (WebCrypto), IV de 12 bytes al azar, AAD =
  `"regalalebitcoins/boveda/v1"` ‖ id de la credencial.
- **Contenido:** los 16 bytes de entropía de la clave maestra.
- **Formato:** `v1.<iv base64url>.<cifrado base64url>`.

El servidor guarda el texto por credencial. Sin la passkey no puede abrirlo; con otra
credencial falla el AAD. Si se pierde la passkey, queda el código de recuperación del panel.

