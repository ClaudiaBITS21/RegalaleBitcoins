import { ApiFailure, api } from './api.ts';

// El código de una invitación (/invitacion/CODIGO) queda guardado en este navegador hasta que haya
// una cuenta: al entrar o crearla se canjea solo si da regalos o listas; si es de descuento, espera
// en el campo «¿Tenés un código?» al comprar un plan.

const KEY = 'regalale.cupon';

export function savePendingCoupon(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Sin almacenamiento: se puede escribir a mano en «Mi plan» o al comprar.
  }
}

export function pendingCoupon(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingCoupon(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}

/** Con la cuenta abierta: canjea el código pendiente si da créditos. true si se canjeó. */
export async function redeemPendingCoupon(): Promise<boolean> {
  const code = pendingCoupon();
  if (code === null) return false;
  try {
    await api.redeemCoupon(code);
    clearPendingCoupon();
    return true;
  } catch (e) {
    // De descuento: se usa al comprar. Sin sesión o sin conexión: se intenta la próxima vez.
    const keep = e instanceof ApiFailure && (e.code === 'cupon_es_de_compra' || e.status === 401 || e.status === 0);
    if (!keep) clearPendingCoupon();
    return false;
  }
}
