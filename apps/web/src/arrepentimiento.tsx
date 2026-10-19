import { useEffect, useState } from 'preact/hooks';
import { ApiFailure, api } from './api.ts';
import { PRODUCT_NAME } from './comprar.tsx';
import { formatSats } from './format.ts';
import type { Key } from './i18n/index.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';

// Botón de arrepentimiento (handoff 2026-10-19, «cobro y créditos»): visible en el pie. Lista las
// compras de la cuenta; las que todavía se pueden devolver piden una dirección y dan un código de
// trámite. La devolución (los mismos sats) la manda la responsable a mano.

type Purchases = Awaited<ReturnType<typeof api.purchases>>;

export function RefundPage({ testnet }: { testnet: boolean }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Purchases | null>(null);
  const [state, setState] = useState<'cargando' | 'afuera' | 'listo' | 'error'>('cargando');
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, Key>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await api.purchases());
      setState('listo');
    } catch (e) {
      setState(e instanceof ApiFailure && e.status === 401 ? 'afuera' : 'error');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const ask = async (id: string) => {
    setBusy(true);
    setErrors((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== id)));
    try {
      await api.refund(id, addresses[id] ?? '');
      await load();
    } catch (e) {
      const code = e instanceof ApiFailure ? e.code : '';
      setErrors((x) => ({ ...x, [id]: code === 'direccion_invalida' ? 'arrep.direccionInvalida' : code === 'creditos_usados' ? 'arrep.usado' : 'arrep.error' }));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (state === 'afuera') {
    body = (
      <>
        <p>{t('arrep.sesion')}</p>
        <Button onClick={() => window.location.assign('/panel')}>{t('comprar.entrar')}</Button>
      </>
    );
  } else if (state === 'error') {
    body = <Notice kind="error">{t('arrep.error')}</Notice>;
  } else if (data === null) {
    body = <p class="texto-suave cargando">…</p>;
  } else if (data.compras.length === 0) {
    body = <p>{t('arrep.vacio')}</p>;
  } else {
    body = (
      <ul class="arrep-compras">
        {data.compras.map((c) => (
          <li class="caja" key={c.id}>
            <strong>{t(PRODUCT_NAME[c.producto] ?? 'precios.pack10.n')}</strong>
            <span class="texto-suave">
              {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(c.fecha))} · {formatSats(BigInt(c.sats), lang)}
            </span>
            {c.arrepentimiento !== null ? (
              <p>{t(c.arrepentimiento.estado === 'devuelto' ? 'arrep.devuelto' : 'arrep.pedido', { codigo: c.arrepentimiento.codigo })}</p>
            ) : c.noProcede !== null ? (
              <p class="texto-suave">{c.noProcede === 'vencido' ? t('arrep.vencido', { dias: data.dias }) : t('arrep.usado')}</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(c.id);
                }}
              >
                <label class="campo">
                  <span>{t('arrep.direccion')}</span>
                  <input
                    required
                    autocomplete="off"
                    spellcheck={false}
                    value={addresses[c.id] ?? ''}
                    onInput={(e) => setAddresses((x) => ({ ...x, [c.id]: (e.currentTarget as HTMLInputElement).value }))}
                  />
                </label>
                {errors[c.id] !== undefined && <Notice kind="error">{t(errors[c.id] as Key)}</Notice>}
                <Button type="submit" kind="contorno" disabled={busy}>
                  {t('arrep.boton')}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Layout testnet={testnet}>
      <div class="paso">
        <StepTitle>{t('arrep.titulo')}</StepTitle>
        <p class="texto-suave">{t('arrep.texto', { dias: data?.dias ?? 10 })}</p>
        {body}
      </div>
    </Layout>
  );
}
