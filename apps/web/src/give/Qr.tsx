import encodeQR from 'qr';
import { useMemo } from 'preact/hooks';

/**
 * Código QR dibujado como SVG desde la matriz: sin innerHTML ni imágenes "data:",
 * compatible con la CSP y Trusted Types.
 */
export function Qr({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const grid = encodeQR(text, 'raw', { ecc: 'medium', border: 2 });
    let d = '';
    grid.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size: grid.length, path: d };
  }, [text]);
  return (
    <svg class="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
