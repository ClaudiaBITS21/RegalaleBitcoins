import { useState } from 'preact/hooks';
import { type AccountGift, accountApi } from '../account.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { resealCard } from './tarjetas.ts';

// Editar un regalo ya mandado (Claudia, 04/11/2026), desde «Mis regalos»: el mensaje y si quien
// recibe ve cuánto vale. Solo mientras no se abrió; quien recibe ve los cambios al abrir el link.

const MAX = 280;

export function EditarRegalo({ gift: g, master, onDone }: { gift: AccountGift; master: string | null; onDone: () => void }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(g.mensaje ?? '');
  const [showValue, setShowValue] = useState(g.mostrarValor !== false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const [saved, setSaved] = useState(false);
  const left = MAX - [...message].length;
  const currency = g.original?.moneda === 'ARS' ? 'regalar.cuanto.pesos' : 'regalar.cuanto.dolares';

  const save = async () => {
    setBusy(true);
    setProblem(false);
    try {
      // Con la tarjeta cifrada (08/11/2026), el mensaje nuevo se cifra acá y viaja cifrado.
      const sealed = g.tarjeta != null && master !== null && g.para !== null ? await resealCard(g, master, { para: g.para, de: g.de ?? null, mensaje: message.trim() }) : null;
      if (g.tarjeta != null && sealed === null) throw new Error('sin la clave para cifrar');
      if (sealed !== null) await accountApi.sealCard(g.id, sealed);
      await accountApi.editGift(g.id, sealed !== null ? { mostrarValor: showValue } : { mensaje: message.trim(), mostrarValor: showValue });
      setSaved(true);
      onDone();
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="regalo-secretos">
      <label class="campo">
        <span>{t('panel.editar.mensaje')}</span>
        <textarea rows={3} value={message} onInput={(e) => (setMessage((e.currentTarget as HTMLTextAreaElement).value), setSaved(false))} />
        <small class={left < 0 ? 'error-campo' : 'contador'}>
          {left < 0 ? t('regalar.para.sobran', { n: String(-left) }) : t('regalar.para.quedan', { n: String(left) })}
        </small>
      </label>
      {g.original != null && (
        <label class="casilla">
          <input type="checkbox" checked={showValue} onChange={(e) => (setShowValue((e.currentTarget as HTMLInputElement).checked), setSaved(false))} />
          <span>{t('regalar.cuanto.mostrar', { moneda: t(currency) })}</span>
        </label>
      )}
      {saved && <Notice kind="ok">{t('panel.editar.listo')}</Notice>}
      {problem && <Notice kind="error">{t('panel.editar.error')}</Notice>}
      <Button disabled={busy || left < 0} onClick={() => void save()}>
        {t('panel.editar.guardar')}
      </Button>
    </div>
  );
}
