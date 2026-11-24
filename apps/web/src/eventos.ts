import { visitOrigin } from './origen.ts';

// Embudo por campaña (Claudia, 24/11/2026): al pasar por cada paso del camino, el navegador avisa
// «pasó tal paso, en una visita que llegó de tal lado» y el servidor suma 1 a un contador por
// semana. El aviso lleva solo esas dos palabras: ni el regalo, ni la cuenta, ni el monto. Sin
// cookies ni scripts de terceros (docs/eventos.md).

export type FunnelEvent =
  | 'visita'
  | 'regalar_inicio'
  | 'regalo_creado'
  | 'pago_visto'
  | 'regalo_compartido'
  | 'compra'
  | 'link_abierto'
  | 'palabras_ok'
  | 'regalo_abierto';

const KEY = 'regalale.eventos';

/** Lo ya avisado en esta visita. Queda en el navegador (sessionStorage) y nunca se manda. */
function yaAvisado(marca: string): boolean {
  try {
    const hechos: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    const lista = Array.isArray(hechos) ? hechos.filter((x): x is string => typeof x === 'string') : [];
    if (lista.includes(marca)) return true;
    sessionStorage.setItem(KEY, JSON.stringify([...lista, marca].slice(-200)));
    return false;
  } catch {
    // Sin almacenamiento no se puede evitar contar dos veces: mejor no contar.
    return true;
  }
}

/**
 * Cuenta un paso, una sola vez por visita (y por `cosa`, si se pasa: el id del regalo o de la
 * compra, que solo sirve acá para no repetir y no sale del navegador). Nunca falla ni demora nada.
 */
export function countEvent(evento: FunnelEvent, cosa = ''): void {
  if (yaAvisado(`${evento}:${cosa}`)) return;
  try {
    void fetch('/api/eventos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evento, origen: visitOrigin() }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // La estadística nunca rompe la página.
  }
}
