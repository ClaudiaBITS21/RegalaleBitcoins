import type { MiddlewareHandler } from 'hono';

// Cabeceras para las páginas de la web. Sin scripts de terceros, sin inline, sin
// marcos: el JS que corre es solo el nuestro, servido desde este origen.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('content-security-policy', CONTENT_SECURITY_POLICY);
    c.header('referrer-policy', 'no-referrer');
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('cross-origin-opener-policy', 'same-origin');
    c.header('cross-origin-resource-policy', 'same-origin');
    c.header('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
    c.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
  };
}
