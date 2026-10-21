import type { Key } from '../i18n/index.ts';
import { useI18n } from '../ui.tsx';
import type { Cobro, Medio } from './cobro.ts';
import { MEDIOS_DE, MONEDA, monedasIso, type Pais, PAISES, validarDato } from './medios.ts';

// Datos de cobro de una lista: país, medio, dato y titular (y moneda, en «Otro»). Se validan acá;
// después se cifran en el navegador (cobro.ts) y el servidor nunca ve el dato.

export interface CobroDraft {
  readonly pais: Pais;
  readonly medio: Medio;
  readonly dato: string;
  readonly titular: string;
  readonly monedaOtro: string;
}

export const emptyCobro = (pais: Pais = 'AR'): CobroDraft => ({ pais, medio: (MEDIOS_DE[pais][0] as Medio), dato: '', titular: '', monedaOtro: 'USD' });

/** El dato listo para cifrar, o el problema para mostrar. */
export function checkCobro(d: CobroDraft): { ok: true; cobro: Cobro; moneda: string } | { ok: false; error: Key | null } {
  if (d.dato.trim() === '') return { ok: false, error: null };
  const r = validarDato(d.medio, d.dato);
  if (!r.ok) return { ok: false, error: `lista.cobro.error.${r.problema}` as Key };
  if (d.titular.trim() === '') return { ok: false, error: null };
  const moneda = d.pais === 'XX' ? d.monedaOtro : MONEDA[d.pais];
  return { ok: true, cobro: { medio: d.medio, dato: r.dato, titular: d.titular.trim() }, moneda };
}

const PLACEHOLDER: Readonly<Record<Medio, string>> = {
  alias: 'ana.leo.mp',
  cbu: '0000003100012345678901',
  pix: 'ana@exemplo.com.br',
  breb: '@anaperez',
  iban: 'ES91 2100 0418 4502 0005 1332',
  otro: '',
};

export function CobroFields({ value, onChange }: { value: CobroDraft; onChange: (d: CobroDraft) => void }) {
  const { t } = useI18n();
  const check = checkCobro(value);
  const set = (p: Partial<CobroDraft>) => onChange({ ...value, ...p });
  return (
    <>
      <label class="campo">
        <span>{t('lista.cobro.pais')}</span>
        <select value={value.pais} onChange={(e) => {
          const pais = (e.currentTarget as HTMLSelectElement).value as Pais;
          set({ pais, medio: MEDIOS_DE[pais][0] as Medio, dato: '' });
        }}>
          {PAISES.map((p) => (
            <option key={p} value={p}>
              {t(`lista.pais.${p}` as Key)}
            </option>
          ))}
        </select>
      </label>
      {MEDIOS_DE[value.pais].length > 1 && (
        <div class="estilos" role="radiogroup" aria-label={t('lista.cobro.medio')}>
          {MEDIOS_DE[value.pais].map((m) => (
            <button type="button" role="radio" key={m} aria-checked={value.medio === m} class={`estilo-opcion${value.medio === m ? ' elegida' : ''}`} onClick={() => set({ medio: m, dato: '' })}>
              {t(`lista.medio.${m}` as Key)}
            </button>
          ))}
        </div>
      )}
      {value.pais === 'XX' && (
        <label class="campo">
          <span>{t('lista.cobro.moneda')}</span>
          <select value={value.monedaOtro} onChange={(e) => set({ monedaOtro: (e.currentTarget as HTMLSelectElement).value })}>
            {monedasIso().map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      <label class="campo">
        <span>{t(`lista.medio.${value.medio}` as Key)}</span>
        {value.medio === 'otro' ? (
          <textarea rows={2} maxLength={120} value={value.dato} onInput={(e) => set({ dato: (e.currentTarget as HTMLTextAreaElement).value })} />
        ) : (
          <input type="text" value={value.dato} autocapitalize="none" spellcheck={false} autocomplete="off" placeholder={PLACEHOLDER[value.medio]} onInput={(e) => set({ dato: (e.currentTarget as HTMLInputElement).value })} />
        )}
        {(value.medio === 'pix' || value.medio === 'breb' || value.medio === 'otro') && <small class="texto-suave">{t('lista.cobro.documentoAviso')}</small>}
        {!check.ok && check.error !== null && <small class="error-campo">{t(check.error)}</small>}
      </label>
      <label class="campo">
        <span>{t('lista.pesos.titular')}</span>
        <input type="text" value={value.titular} maxLength={60} autocomplete="name" onInput={(e) => set({ titular: (e.currentTarget as HTMLInputElement).value })} />
      </label>
      <small class="texto-suave">{t('lista.cobro.cifrado')}</small>
    </>
  );
}
