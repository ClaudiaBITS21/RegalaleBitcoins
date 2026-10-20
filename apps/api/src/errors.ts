// Errores de la API: código estable para la web y mensaje para el log.

export type ErrorCode =
  | 'regalo_no_encontrado'
  | 'regalo_no_disponible'
  | 'pedido_invalido'
  | 'transaccion_invalida'
  | 'fondos_cambiaron'
  | 'ya_reclamado'
  | 'cadena_no_disponible'
  | 'difusion_rechazada'
  | 'regalo_existente'
  | 'monto_invalido'
  | 'demasiados_pedidos'
  | 'no_autorizado'
  | 'cuenta_existente'
  | 'passkey_invalida'
  | 'passkey_desconocida'
  | 'sesion_requerida'
  | 'link_invalido'
  | 'no_encontrado'
  | 'producto_invalido'
  | 'cobro_no_configurado'
  | 'fundadores_agotados'
  | 'agotado'
  | 'passkey_requerida'
  | 'sin_creditos'
  | 'direccion_invalida'
  | 'arrepentimiento_vencido'
  | 'creditos_usados';

export class ApiError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502;
  readonly code: ErrorCode;
  constructor(status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502, code: ErrorCode, message: string = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
