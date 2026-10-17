import { useEffect, useRef, useState } from 'preact/hooks';
import { BitcoinBIcon } from './BitcoinB.tsx';
import { useI18n } from '../ui.tsx';
import { COIN_COLORS, REASONS } from './razones.ts';

// Las 21 razones en abanico (docs/contenido.md §1 y docs/diseno/DISENO.md §5): tres cartas
// como en la mano; la del centro se da vuelta sola al llegar. Swipe, flechas o tocar una
// lateral. Las transformaciones van por CSSOM (style como objeto), compatible con la CSP.

const TOTAL = 21;
const REVEAL_MS = 500;
const SWIPE_PX = 60;

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function ReasonsFan({ ctaHref }: { ctaHref: string }) {
  const { t, lang } = useI18n();
  const reasons = REASONS[lang];
  const wide = useMedia('(min-width: 900px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(new Set());
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reveal = (j: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => {
        setFlipped((f) => new Set(f).add(j));
        setSeen((s) => new Set(s).add(j));
      },
      still ? 0 : REVEAL_MS,
    );
  };
  useEffect(() => {
    reveal(0);
    return () => window.clearTimeout(timer.current);
  }, []);

  const go = (delta: number) => {
    const j = Math.max(0, Math.min(TOTAL - 1, index + delta));
    setDrag(0);
    setDragging(false);
    if (j === index) return;
    setFlipped((f) => {
      const n = new Set(f);
      n.delete(j);
      return n;
    });
    setIndex(j);
    reveal(j);
  };

  const side = wide ? 110 : 78;
  const k = Math.max(-1, Math.min(1, drag / 150));
  const count = seen.size;

  return (
    <div class="abanico">
      <div
        class="abanico-cartas"
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? null;
          setDragging(true);
        }}
        onTouchMove={(e) => {
          const x = e.touches[0]?.clientX;
          if (startX.current !== null && x !== undefined) setDrag(x - startX.current);
        }}
        onTouchEnd={() => {
          startX.current = null;
          if (drag < -SWIPE_PX) go(1);
          else if (drag > SWIPE_PX) go(-1);
          else {
            setDrag(0);
            setDragging(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(1);
          if (e.key === 'ArrowLeft') go(-1);
        }}
      >
        {reasons.map(([title, detail], j) => {
          const off = j - index;
          const visible = off >= -1 && off <= 1;
          let transform: string;
          let opacity = 1;
          let z = 0;
          if (off === 0) {
            transform = `translateX(${drag}px) rotate(${drag / 14}deg)`;
            z = 30;
          } else if (off === 1) {
            const p = Math.max(0, -k);
            transform = `translateX(${side - side * p}px) rotate(${14 - 14 * p}deg) scale(${0.88 + 0.12 * p})`;
            z = 20;
          } else if (off === -1) {
            const p = Math.max(0, k);
            transform = `translateX(${-side + side * p}px) rotate(${-14 + 14 * p}deg) scale(${0.88 + 0.12 * p})`;
            z = 20;
          } else {
            transform = `translateX(${off < 0 ? -side * 1.8 : side * 1.8}px) rotate(${off < 0 ? -22 : 22}deg) scale(.72)`;
            opacity = 0;
          }
          const open = off === 0 && flipped.has(j);
          const coin = COIN_COLORS[j % COIN_COLORS.length] as string;
          const n = j + 1;
          return (
            <button
              type="button"
              key={j}
              class={`carta${dragging && visible ? ' arrastrando' : ''}`}
              style={{ transform, opacity, zIndex: z, pointerEvents: visible ? 'auto' : 'none' }}
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible}
              aria-label={
                off === 0 ? (open ? t('razones.cartaAbierta', { n, texto: `${title} ${detail}` }) : t('razones.carta', { n })) : t('razones.ir', { n })
              }
              onClick={() => {
                if (off !== 0) return go(off);
                if (!seen.has(j)) return reveal(j);
                setFlipped((f) => {
                  const s = new Set(f);
                  if (s.has(j)) s.delete(j);
                  else s.add(j);
                  return s;
                });
              }}
            >
              <span class={`carta-giro${open ? ' abierta' : ''}`}>
                <span class="carta-cara carta-frente">
                  <span class="moneda" style={{ background: coin }} aria-hidden="true">
                    <span class="moneda-n">{n}</span>
                    <BitcoinBIcon class="moneda-b" />
                  </span>
                  <span class="carta-pie">{n} / 21</span>
                </span>
                <span class="carta-cara carta-dorso">
                  <span class="carta-numero" style={{ background: coin }}>
                    {n} / 21
                  </span>
                  {/* El texto de las dos caras está en el HTML: lo leen los buscadores y los lectores de pantalla. */}
                  <span class="carta-titulo">{title}</span>
                  <span class="carta-detalle">{detail}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div class="abanico-control">
        <button type="button" class="boton-flecha" disabled={index === 0} aria-label={t('razones.anterior')} onClick={() => go(-1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="abanico-contador">
          <span aria-live="polite">{t('razones.contador', { n: count })}</span>
          <span class="barra">
            <span style={{ width: `${Math.round((count / TOTAL) * 100)}%` }} />
          </span>
        </div>
        <button type="button" class="boton-flecha" disabled={index === TOTAL - 1} aria-label={t('razones.siguiente')} onClick={() => go(1)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      {count === TOTAL && (
        <a class="boton boton-acento cierre-razones" href={ctaHref}>
          {t('razones.cierre')}
        </a>
      )}
    </div>
  );
}
