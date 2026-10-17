// La ₿ dibujada con trazos, igual que en el ícono (public/favicon.svg). Las tipografías del sitio
// no traen el carácter ₿ y el navegador lo reemplazaba por una con serifa: así queda igual en
// todos lados. Se ubica por su centro (cx, cy) y su alto total (h, con las rayitas).

export const B_PATH = 'M27 22v28M27 22h9.5a7 7 0 0 1 0 14H27M27 36h11a7 7 0 0 1 0 14H27M30.5 17.5V22M36.5 17.5V22M30.5 50v4.5M36.5 50v4.5';
const HEIGHT = 37; // de 17.5 a 54.5, centrada en (36, 36)

export function BitcoinB({ cx, cy, h, color, weight = 4.5 }: { cx: number; cy: number; h: number; color: string; weight?: number }) {
  const k = h / HEIGHT;
  return (
    <path
      d={B_PATH}
      transform={`translate(${cx} ${cy}) scale(${k}) translate(-36 -36)`}
      fill="none"
      stroke={color}
      stroke-width={weight}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  );
}

/** La ₿ sola, para usar dentro de texto o de un elemento HTML. */
export function BitcoinBIcon({ class: className }: { class?: string }) {
  return (
    <svg class={className} viewBox="22 14 28 44" width="0.64em" height="1em" aria-hidden="true">
      <BitcoinB cx={36} cy={36} h={37} color="currentColor" />
    </svg>
  );
}
