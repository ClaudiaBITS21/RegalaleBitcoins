import type { Lang } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import type { GiftView } from '../api.ts';
import { BitcoinB } from '../content/BitcoinB.tsx';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { examplesFor, looksLikeLink, pickExample, REMATE_MAX, useExamples } from '../content/mensajes.ts';
import { occasionLabel } from '../content/occasions.ts';
import { type Key, translate } from '../i18n/index.ts';
import { Button, useI18n } from '../ui.tsx';
import { Qr } from './Qr.tsx';

// Tarjeta para entregar en mano (docs/handoff/2026-10-17/INDICE-chat.txt, sección 3): una hoja
// A4 impresa de un solo lado y doblada en cuatro, queda en A6. Arriba (girada 180°) la tapa y
// la contratapa; abajo, el interior: el mensaje a la izquierda y, a la derecha, el QR del link
// con un recuadro para escribir a mano las 4 palabras. Las palabras nunca se imprimen.
// Todo se arma en el navegador: el link no sale de esta página.

const chars = (s: string) => [...s].length;

function Coin({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r="32" fill="#FF8A1F" stroke="#1A1530" stroke-width="4" />
      <circle cx="36" cy="36" r="23" fill="none" stroke="#1A1530" stroke-width="2" />
      <BitcoinB cx={36} cy={36} h={37} color="#1A1530" />
    </svg>
  );
}

export function PrintCard({ link, view }: { link: string; view: GiftView }) {
  const { t } = useI18n();
  const lang = view.idioma as Lang;
  const r = (key: Key, vars?: Record<string, string>) => translate(lang, key, vars);
  const examples = useExamples(lang);
  const remates = examples === null ? [] : examplesFor(examples, view.ocasion, 'remates');
  const [example, setExample] = useState<string | null>(null);
  const [remate, setRemate] = useState('');
  const [undo, setUndo] = useState<string | null>(null);

  // Viene un remate de ejemplo al azar según la ocasión; "Otra idea" lo cambia.
  useEffect(() => {
    if (example !== null || remates.length === 0) return;
    const ex = pickExample(remates);
    setExample(ex);
    setRemate(ex ?? '');
  }, [remates.length]);

  const another = () => {
    const ex = pickExample(remates, example);
    if (ex === null) return;
    setUndo(remate !== example && remate !== '' ? remate : null);
    setExample(ex);
    setRemate(ex);
  };

  const tooLong = chars(remate) > REMATE_MAX;
  const isLink = looksLikeLink(remate);
  const ok = !tooLong && !isLink;

  return (
    <section class="caja envio imprimir">
      <h3>{t('tarjeta.titulo')}</h3>
      <p class="texto-suave">{t('tarjeta.texto')}</p>
      <label class="campo">
        <span>{t('tarjeta.remate')}</span>
        <input type="text" value={remate} onInput={(e) => (setRemate((e.currentTarget as HTMLInputElement).value), setUndo(null))} />
        <span class="mensaje-acciones">
          {remates.length > 1 && (
            <button type="button" class="boton-texto" onClick={another}>
              {t('regalar.mensaje.otraIdea')}
            </button>
          )}
          {undo !== null && (
            <button type="button" class="boton-texto" onClick={() => (setRemate(undo), setUndo(null))}>
              {t('regalar.mensaje.deshacer')}
            </button>
          )}
        </span>
        {isLink ? (
          <small class="error-campo">{t('tarjeta.sinLinks')}</small>
        ) : (
          <small class={tooLong ? 'error-campo' : 'contador'}>{tooLong ? t('regalar.para.sobran', { n: String(chars(remate) - REMATE_MAX) }) : t('regalar.para.quedan', { n: String(REMATE_MAX - chars(remate)) })}</small>
        )}
      </label>
      <Button kind="contorno" disabled={!ok} onClick={() => window.print()}>
        {t('tarjeta.imprimir')}
      </Button>
      <small class="texto-suave">{t('tarjeta.doblar')}</small>

      {/* La hoja que se imprime: oculta en pantalla. */}
      <div class="hoja-a4" aria-hidden="true" lang={lang}>
        <div class="panel panel-girado panel-tapa">
          <span class="tapa-ocasion">{occasionLabel(view.ocasion, lang, view.ocasionLibre)}</span>
          <GiftCardArt occasion={view.ocasion} variant={view.imagen} estilo={view.estilo} src={`/api/gifts/${view.id}/imagen`} class="tapa-arte" />
          <div class="tapa-para">
            <span>{r('tarjeta.para')}</span>
            <strong>{view.para}</strong>
            <span class="tapa-adentro">{r('tarjeta.adentro')}</span>
          </div>
        </div>
        <div class="panel panel-girado panel-contratapa">
          <Coin size={96} />
          <p class="contratapa-remate">{ok ? remate : ''}</p>
          <p class="contratapa-marca">
            <Coin size={18} /> {r('tarjeta.hecho')} <strong>regalalebitcoins.com</strong>
          </p>
        </div>
        <div class="panel panel-mensaje">
          {view.mensaje !== '' && (
            <>
              <span class="mensaje-comillas">“</span>
              <p>{view.mensaje}</p>
            </>
          )}
          {view.de !== null && view.de !== '' && <strong class="mensaje-firma">{view.de}</strong>}
        </div>
        <div class="panel panel-abrir">
          <div class="abrir-cabeza">
            <Qr text={link} label={r('regalar.pagar.qr')} />
            <div>
              <strong>{r('tarjeta.abrir')}</strong>
              <span>{r('tarjeta.todo')}</span>
            </div>
          </div>
          <ol class="abrir-pasos">
            <li>{r('tarjeta.paso1')}</li>
            <li>{r('tarjeta.paso2')}</li>
            <li>{r('tarjeta.paso3')}</li>
          </ol>
          <div class="abrir-palabras">
            <strong>{r('tarjeta.palabras')}</strong>
            <div class="renglones">
              {[1, 2, 3, 4].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <small>{r('tarjeta.palabrasAviso')}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
