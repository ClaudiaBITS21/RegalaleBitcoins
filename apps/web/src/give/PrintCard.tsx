import type { Lang } from '@regalale/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GiftView } from '../api.ts';
import { GiftCardArt } from '../content/GiftCardArt.tsx';
import { examplesFor, looksLikeLink, pickExample, REMATE_MAX, useExamples } from '../content/mensajes.ts';
import { occasionLabel } from '../content/occasions.ts';
import { type Key, translate } from '../i18n/index.ts';
import { Button, useI18n } from '../ui.tsx';
import { artImage, type CardTexts, canvasJpeg, drawCard, jpegToPdf, previewUrl } from './tarjetaPdf.ts';

// Tarjeta para entregar en mano (docs/handoff/2026-10-17/INDICE-chat.txt, sección 3): una hoja
// A4 impresa de un solo lado y doblada en cuatro, queda en A6. Arriba (girada 180°) la tapa y
// la contratapa; abajo, el interior: el mensaje a la izquierda y, a la derecha, el QR del link
// con un recuadro para escribir a mano las 4 palabras. Las palabras nunca se imprimen.
// Todo se arma en el navegador (give/tarjetaPdf.ts): el link no sale de esta página.

const chars = (s: string) => [...s].length;

// Se baja como PDF A4 (Rodolfo, 21/10: imprimir desde el celular sacaba la hoja desarmada), con
// su vista preliminar debajo de la frase. Lo gratis no trae la tarjeta: se ve la vista preliminar
// con la marca «Vista previa» y no se baja (Rodolfo, 20/10).
export function PrintCard({ link, view, conPlan }: { link: string; view: GiftView; conPlan: boolean | null }) {
  const { t, trato } = useI18n();
  const lang = view.idioma as Lang;
  // En el idioma de quien recibe; en castellano, con el trato de quien regala (suelen ser del mismo lugar).
  const r = (key: Key, vars?: Record<string, string>) => translate(lang, key, vars, trato);
  const examples = useExamples(lang, trato);
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

  const texts: CardTexts = {
    ocasion: occasionLabel(view.ocasion, lang, view.ocasionLibre),
    para: r('tarjeta.para'),
    nombre: view.para,
    adentro: r('tarjeta.adentro'),
    remate: ok ? remate.trim() : '',
    hecho: r('tarjeta.hecho'),
    mensaje: view.mensaje,
    de: view.de ?? '',
    abrir: r('tarjeta.abrir'),
    todo: r('tarjeta.todo'),
    pasos: [r('tarjeta.paso1'), r('tarjeta.paso2'), r('tarjeta.paso3')],
    palabras: r('tarjeta.palabras'),
    aviso: r('tarjeta.palabrasAviso'),
  };
  const marca = conPlan === false ? t('tarjeta.vistaPrevia') : undefined;

  // Vista preliminar del PDF: se vuelve a dibujar cuando cambia la frase (con una pausa corta).
  const artRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([texts, marca]);
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const art = await artImage(artRef.current);
        // data: y no blob:, que la política de seguridad del sitio no deja mostrar como imagen.
        const url = previewUrl(await drawCard(texts, link, art, marca));
        if (!alive) return;
        setPreview(url);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key]);

  const download = async () => {
    setBusy(true);
    try {
      const art = await artImage(artRef.current);
      const pdf = await jpegToPdf(await canvasJpeg(await drawCard(texts, link, art)));
      const url = URL.createObjectURL(pdf);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tarjeta-${view.para.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'regalo'}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

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

      <div class="tarjeta-vista">
        <strong>{t('tarjeta.vistaPreliminar')}</strong>
        {preview === null ? <p class="texto-suave">{t('tarjeta.preparando')}</p> : <img src={preview} alt={t('tarjeta.vistaPreliminar')} />}
      </div>
      {/* La ilustración de la tapa, fuera de la pantalla: de acá sale la imagen del PDF. */}
      <div class="tarjeta-arte-fuente" ref={artRef} aria-hidden="true">
        <GiftCardArt occasion={view.ocasion} estilo={view.estilo} src={`/api/gifts/${view.id}/imagen`} />
      </div>

      {conPlan === false ? (
        <small class="texto-suave">
          {t('planes.incluido')} <a href="/precios" target="_blank" rel="noopener">{t('planes.ver')}</a>
        </small>
      ) : (
        <>
          {conPlan === true && (
            <Button kind="contorno" disabled={!ok || busy} onClick={() => void download()}>
              {busy ? t('tarjeta.preparando') : t('tarjeta.imprimir')}
            </Button>
          )}
          <small class="texto-suave">{t('tarjeta.doblar')}</small>
        </>
      )}
      {failed && <small class="error-campo">{t('tarjeta.error')}</small>}
    </section>
  );
}
