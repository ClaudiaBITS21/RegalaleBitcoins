import { useState } from 'preact/hooks';
import { CARD_STYLES, type CardStyle, DRAWN_STYLES, GiftCardArt } from '../content/GiftCardArt.tsx';
import { occasionLabel } from '../content/occasions.ts';
import type { Key } from '../i18n/index.ts';
import { Notice, useI18n } from '../ui.tsx';
import type { Draft } from './GivePage.tsx';
import { OwnImageError, processOwnImage } from './ownImage.ts';

// Paso 2: estilo de la tarjeta. Los tres dibujos de la web (una imagen grande por estilo, con el
// nombre de quien recibe; tocarla pasa al estilo siguiente) o "Con tu IA": armamos el pedido para
// que la persona lo pegue en su propia IA y después suba la imagen. La web nunca manda nada a un
// servicio de IA: el pedido lleva la ocasión y el nombre de quien recibe (lo pone la IA en una
// cinta), pero lo copia y lo pega la persona. Los links «Abrir en …» con ?q= llevan el pedido en la
// URL hacia esa IA porque la persona los toca; nosotros no lo registramos en ningún lado.

const STYLE_KEYS: Readonly<Record<CardStyle, Key>> = {
  ilustracion: 'regalar.estilo.ilustracion',
  mano: 'regalar.estilo.mano',
  elegante: 'regalar.estilo.elegante',
  propia: 'regalar.estilo.ia',
};

/** IAs para abrir con el pedido. Las que aceptan ?q= lo reciben ya escrito. */
const AIS: readonly { name: string; url: (prompt: string) => string }[] = [
  { name: 'ChatGPT', url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
  { name: 'Gemini', url: () => 'https://gemini.google.com/app' },
  { name: 'Claude', url: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}` },
];

export function StylePicker({ draft, onChange, conPlan }: { draft: Draft; onChange: (p: Partial<Draft>) => void; conPlan: boolean | null }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const prompt = t('regalar.ia.prompt', { ocasion: occasionLabel(draft.occasion, lang, draft.occasionFree), nombre: draft.to });
  // Al tocar la imagen: Ilustración → Dibujo a mano → Elegante → Ilustración.
  const next = DRAWN_STYLES[(DRAWN_STYLES.indexOf(draft.style) + 1) % DRAWN_STYLES.length] ?? 'ilustracion';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (file === undefined) return;
    setBusy(true);
    setError(null);
    try {
      onChange({ ownImage: await processOwnImage(file) });
    } catch (e) {
      setError(e instanceof OwnImageError ? 'regalar.ia.error' : 'regalar.ia.error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset class="campo">
      <legend>{t('regalar.estilo.titulo')}</legend>
      <div class="estilos" role="radiogroup" aria-label={t('regalar.estilo.titulo')}>
        {CARD_STYLES.map((s) => {
          // La imagen con IA viene con los planes: en lo gratis va con candado (Rodolfo, 20/10).
          const locked = s === 'propia' && conPlan === false;
          return (
            <button
              type="button"
              role="radio"
              key={s}
              aria-checked={draft.style === s}
              aria-disabled={locked}
              class={`estilo-opcion${draft.style === s ? ' elegida' : ''}${locked ? ' bloqueada' : ''}`}
              onClick={() => !locked && onChange({ style: s })}
            >
              {t(STYLE_KEYS[s])}
              {locked && <span aria-label={t('planes.incluido')}> 🔒</span>}
            </button>
          );
        })}
      </div>
      {conPlan === false && (
        <small class="texto-suave">
          {t('regalar.estilo.iaPlanes')} <a href="/precios" target="_blank" rel="noopener">{t('planes.ver')}</a>
        </small>
      )}

      {draft.style !== 'propia' ? (
        <div class="imagen-estilo">
          <button type="button" class="imagen-estilo-boton" aria-label={t('regalar.estilo.tocar', { estilo: t(STYLE_KEYS[draft.style]) })} onClick={() => onChange({ style: next })}>
            <GiftCardArt occasion={draft.occasion} estilo={draft.style} name={draft.to} />
          </button>
          <small class="texto-suave">{t('regalar.estilo.tocarPie')}</small>
        </div>
      ) : (
        <div class="ia">
          <ol class="ia-pasos">
            <li>{t('regalar.ia.paso1')}</li>
            <li>{t('regalar.ia.paso2')}</li>
            <li>{t('regalar.ia.paso3')}</li>
          </ol>
          <textarea class="ia-pedido" rows={6} readOnly value={prompt} onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
          <div class="ia-acciones">
            <button type="button" class="boton boton-contorno" onClick={() => void copy()}>
              {t(copied ? 'regalar.ia.copiado' : 'regalar.ia.copiar')}
            </button>
            {AIS.map((ai) => (
              <a key={ai.name} class="ia-link" href={ai.url(prompt)} target="_blank" rel="noopener noreferrer">
                {t('regalar.ia.abrir', { ia: ai.name })}
              </a>
            ))}
          </div>
          {draft.ownImage !== null && <GiftCardArt occasion={draft.occasion} estilo="propia" src={draft.ownImage.dataUrl} class="ia-vista" />}
          <label class="boton boton-contorno ia-subir">
            {busy ? t('regalar.ia.procesando') : t(draft.ownImage === null ? 'regalar.ia.subir' : 'regalar.ia.cambiar')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="visualmente-oculto"
              disabled={busy}
              onChange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                void upload(input.files?.[0]);
                input.value = '';
              }}
            />
          </label>
          {error !== null && <Notice kind="error">{t(error)}</Notice>}
          <small class="texto-suave">{t('regalar.ia.aviso')}</small>
        </div>
      )}
    </fieldset>
  );
}
