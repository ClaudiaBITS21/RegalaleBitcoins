import { giftRecoveryDescriptor, type GiftAccountKey, type masterRootFromMnemonic, type Network, openRecoveryKey, type RecoveryKey, sealRecoveryKey } from '@regalale/core';
import { accountApi } from '../account.ts';

type HDKey = ReturnType<typeof masterRootFromMnemonic>;

// Recupero avanzado (handoffs del 17/10 y del 21/10/2026; docs/derivacion.md, sección 10): el que
// regala usa la llave de su propia billetera como segunda llave de cada regalo. Acá: guardar y
// leer su clave pública (cifrada con su clave maestra: el servidor no la puede leer) y armar el
// archivo de recupero de cada regalo.

/** La clave de recupero guardada en la cuenta, o null si usa el modo común (o no hay sesión). */
export async function loadRecoveryKey(root: HDKey, network: Network): Promise<RecoveryKey | null> {
  const sealed = await accountApi.recoveryKey().catch(() => null);
  if (sealed === null) return null;
  try {
    return await openRecoveryKey(root, sealed, network);
  } catch {
    // Cifrada con otra clave maestra (otra cuenta) o de otra red: se sigue con el modo común.
    return null;
  }
}

/** Guarda (o borra, con null) la clave de recupero de la cuenta. Afecta solo a los regalos nuevos. */
export async function saveRecoveryKey(root: HDKey, key: RecoveryKey | null): Promise<void> {
  await accountApi.setRecoveryKey(key === null ? null : await sealRecoveryKey(root, key));
}

/** Huella y ruta de la clave usada en un regalo, como la guarda el servidor: b8688df1/48h/1h/0h/2h/0/7. */
export function recoveryPathText(key: RecoveryKey, index: number): string {
  const path = [...key.path, 0, index].map((n) => (n >= 0x80000000 ? `${n - 0x80000000}h` : String(n))).join('/');
  return `${key.fingerprintHex}/${path}`;
}

/** Huella de la billetera en la ruta guardada de un regalo (los 8 primeros caracteres). */
export function fingerprintOf(recoveryPath: string): string {
  return recoveryPath.slice(0, 8);
}

/** Lo que va en el archivo de recupero de un regalo (texto plano, en castellano y en inglés). */
export function recoveryFileText(o: { id: string; address: string; key: RecoveryKey; index: number; gift: GiftAccountKey; witnessScript: string; site: string }): string {
  const descriptor = giftRecoveryDescriptor(o.key, o.index, o.gift);
  return [
    'Regalale Bitcoin — archivo de recupero / recovery file',
    '',
    `Regalo / gift: ${o.site}/r/${o.id}`,
    `Dirección / address: ${o.address}`,
    `Recuperable con tu billetera / recoverable with wallet: ${o.key.fingerprintHex}`,
    '',
    'Descriptor (multifirma 1-de-2 / 1-of-2 multisig, P2WSH):',
    descriptor,
    '',
    `Script de testigo / witness script: ${o.witnessScript}`,
    '',
    'Este archivo no tiene claves privadas: sirve para encontrar el regalo y armar la transacción.',
    'Para firmar hace falta tu billetera. Importalo en una billetera que acepte descriptores',
    '(por ejemplo, Bitcoin Core: importdescriptors) o recuperalo desde tu panel en la web.',
    '',
    'This file holds no private keys. Import the descriptor in a wallet that supports',
    'descriptors (e.g. Bitcoin Core importdescriptors), and sign with your own wallet.',
    '',
  ].join('\n');
}

/** Descarga un texto como archivo, sin pasar por ningún servidor. */
export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBytes(name, new TextEncoder().encode(text), type);
}

export function downloadBytes(name: string, bytes: Uint8Array, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
