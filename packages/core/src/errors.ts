/**
 * Errores del núcleo. El `code` es estable y es lo que la interfaz traduce a un
 * mensaje para el usuario; el `message` es solo para desarrolladores.
 */
export type CoreErrorCode =
  | 'MAINNET_NOT_ALLOWED'
  | 'INVALID_NETWORK'
  | 'NO_SECURE_RANDOM'
  | 'INVALID_MNEMONIC'
  | 'INVALID_INDEX'
  | 'INVALID_PATH'
  | 'INVALID_ENTROPY'
  | 'INVALID_WORD'
  | 'INVALID_LINK'
  | 'INVALID_ADDRESS'
  | 'WRONG_NETWORK'
  | 'UNSUPPORTED_ADDRESS'
  | 'NO_UTXOS'
  | 'INVALID_UTXO'
  | 'INVALID_FEE_RATE'
  | 'AMOUNT_BELOW_DUST'
  | 'SIGNING_FAILED'
  | 'INVALID_VAULT';

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: CoreErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
    this.details = details === undefined ? undefined : Object.freeze({ ...details });
  }
}

export function isCoreError(error: unknown, code?: CoreErrorCode): error is CoreError {
  return error instanceof CoreError && (code === undefined || error.code === code);
}
