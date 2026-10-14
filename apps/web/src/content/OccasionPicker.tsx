import { useState } from 'preact/hooks';
import type { Key } from '../i18n/index.ts';
import { useI18n } from '../ui.tsx';
import { FEATURED, fold, FREE_OCCASION_MAX, OCCASION_GROUPS, OCCASION_LABELS, type OccasionKey, seasonalOccasion } from './occasions.ts';
import { browserCountry } from './temporada.ts';

/** La ocasión elegida: del catálogo o libre ("otra" con el texto que escribió la persona). */
export type OccasionChoice = { readonly key: OccasionKey; readonly free?: string };

const SEASON_COLOR = '#eee9ff';

/**
 * Selector de ocasiones (docs/diseno/DISENO.md §4): las de siempre más una de temporada,
 * y "Más ocasiones" con buscador sin tildes, grupos y ocasión libre.
 */
export function OccasionPicker({ value, onPick }: { value: OccasionChoice | null; onPick: (choice: OccasionChoice | null) => void }) {
  const { t, lang } = useI18n();
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState('');
  const seasonal = seasonalOccasion(new Date(), browserCountry());
  const label = (k: OccasionKey) => OCCASION_LABELS[k][lang];
  const isSel = (k: OccasionKey) => value !== null && value.key === k && value.free === undefined;
  const toggle = (k: OccasionKey) => onPick(isSel(k) ? null : { key: k });

  const featured: Array<{ key: OccasionKey; color: string; tag: boolean }> = [];
  if (!FEATURED.some(([k]) => k === seasonal)) featured.push({ key: seasonal, color: SEASON_COLOR, tag: true });
  for (const [k, color] of FEATURED) featured.push({ key: k, color, tag: k === seasonal });

  const q = fold(query);
  const groups = OCCASION_GROUPS.map((g) => ({ ...g, items: g.items.filter((k) => q === '' || fold(label(k)).includes(q)) })).filter((g) => g.items.length > 0);
  const free = query.trim().slice(0, FREE_OCCASION_MAX);

  return (
    <div class="ocasiones">
      <div class="chips">
        {featured.map(({ key, color, tag }) => (
          <button type="button" key={key} class={`chip${isSel(key) ? ' elegido' : ''}`} style={{ background: color }} aria-pressed={isSel(key)} onClick={() => toggle(key)}>
            {label(key)}
            {tag && <span class="etiqueta-temporada">{t('home.seViene')}</span>}
          </button>
        ))}
        <button type="button" class="chip chip-borde" aria-expanded={more} onClick={() => setMore(!more)}>
          {t(more ? 'home.menosOcasiones' : 'home.masOcasiones')}
        </button>
      </div>
      {more && (
        <div class="panel-ocasiones">
          <label class="campo">
            <span>{t('home.buscar')}</span>
            <input type="text" value={query} placeholder={t('home.buscarEj')} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {groups.map((g) => (
            <div class="grupo-ocasiones" key={g.id}>
              <h3>{t(`home.grupo.${g.id}` as Key)}</h3>
              <div class="chips">
                {g.items.map((k) => (
                  <button type="button" key={k} class={`chip chip-chico${isSel(k) ? ' elegido' : ''}`} style={{ background: g.color }} aria-pressed={isSel(k)} onClick={() => toggle(k)}>
                    {label(k)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {q !== '' && groups.length === 0 && <p class="texto-suave">{t('home.sinResultados')}</p>}
          <div class="ocasion-libre">
            <span class="texto-suave">{t('home.noEsta')}</span>
            <button
              type="button"
              class={`chip chip-libre${value?.free !== undefined && value.free === free ? ' elegido' : ''}`}
              disabled={free === ''}
              onClick={() => onPick({ key: 'otra', free })}
            >
              {free === '' ? t('home.escribila') : t('home.usarLibre', { texto: free })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Texto de la ocasión elegida, para el botón "Regalar para…". */
export function choiceLabel(choice: OccasionChoice, lang: keyof (typeof OCCASION_LABELS)['cumple']): string {
  return choice.free ?? OCCASION_LABELS[choice.key][lang];
}

/** Link al flujo de regalar con la ocasión ya elegida. */
export function giveHref(choice: OccasionChoice): string {
  const params = new URLSearchParams({ ocasion: choice.key });
  if (choice.free !== undefined) params.set('libre', choice.free);
  return `/regalar?${params.toString()}`;
}
