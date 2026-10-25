import {
  buildRecoveryPsbt,
  CoreError,
  deriveGift,
  finalizeRecoveryPsbt,
  isCoreError,
  masterRootFromMnemonic,
  type Network,
  parseDestination,
  planSweep,
  psbtToBase64,
  readPsbt,
  type RecoveryKey,
  type SweepPlan,
} from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import type { AccountGift } from '../account.ts';
import { ApiFailure, api } from '../api.ts';
import { formatSats } from '../format.ts';
import { Qr } from '../give/Qr.tsx';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, useI18n } from '../ui.tsx';
import { AdvancedIntro, ConnectWallet } from './Avanzado.tsx';
import { downloadBytes, downloadText, fingerprintOf, loadRecoveryKey, recoveryFileText, saveRecoveryKey } from './recupero.ts';

// En «Mis regalos»: recuperar un regalo multifirma con la billetera propia (PSBT), bajar su
// archivo de recupero, y elegir con qué llave se recuperan los regalos nuevos.

type Root = ReturnType<typeof masterRootFromMnemonic>;

const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => Number.parseInt(x, 16));

/** Lo que hace falta del regalo y de la cuenta para recuperarlo o describirlo. */
async function giftContext(g: AccountGift, root: Root, network: Network) {
  const [view, key] = await Promise.all([api.gift(g.id), loadRecoveryKey(root, network)]);
  if (view.testigo == null || g.indice === null) throw new CoreError('INVALID_UTXO', 'No es un regalo multifirma.');
  const gift = deriveGift(root, g.indice, g.idioma, network);
  return { view, key, gift, witnessScript: fromHex(view.testigo), giftScript: parseDestination(view.direccion, network).script };
}

function problemKey(e: unknown): Key {
  if (isCoreError(e, 'SIGNING_FAILED')) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === 'sin_firma') return 'avanzado.recuperar.sinFirma';
    if (reason === 'otra_psbt' || reason === 'formato') return 'avanzado.recuperar.otraPsbt';
  }
  if (isCoreError(e, 'NO_UTXOS')) return 'avanzado.recuperar.sinFondos';
  if (isCoreError(e, 'AMOUNT_BELOW_DUST')) return 'confirmar.polvo';
  if (isCoreError(e, 'WRONG_NETWORK')) return 'direccion.otraRed';
  if (isCoreError(e, 'UNSUPPORTED_ADDRESS')) return 'direccion.noSoportada';
  if (isCoreError(e, 'INVALID_ADDRESS')) return 'direccion.invalida';
  if (e instanceof ApiFailure && e.code === 'fondos_cambiaron') return 'confirmar.cambio';
  if (e instanceof ApiFailure && (e.status === 0 || e.status >= 500)) return 'reclamo.sinRed';
  return 'confirmar.error';
}

/** Recuperar un regalo multifirma: la web arma la PSBT, la billetera la firma, la web la difunde. */
export function RecoverWithWallet({ gift: g, root, network, onDone }: { gift: AccountGift; root: Root; network: Network; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: Key; vars?: Record<string, string> } | null>(null);
  const [built, setBuilt] = useState<{ plan: SweepPlan; psbt: Uint8Array; witnessScript: Uint8Array } | null>(null);
  const [signedText, setSignedText] = useState('');
  const [done, setDone] = useState(false);
  const expected = g.rutaRecupero == null ? '' : fingerprintOf(g.rutaRecupero);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const destination = parseDestination(address, network);
      const { key, gift, witnessScript, giftScript } = await giftContext(g, root, network);
      if (key === null || key.fingerprintHex !== expected) {
        setError({ key: 'avanzado.recuperar.otraBilletera', vars: { huella: expected } });
        return;
      }
      if (destination.address === g.direccion) throw new CoreError('INVALID_ADDRESS', 'Es la dirección del regalo.');
      const [utxos, fees] = await Promise.all([api.utxos(g.id), api.fees()]);
      const plan = planSweep({ network, utxos, giftScript, destination, feeRate: fees.halfHour, witnessScript });
      const rawTxs = new Map(utxos.map((u) => [u.txid.toLowerCase(), u.rawTx] as const));
      const index = g.indice as number;
      const psbt = buildRecoveryPsbt({ plan, witnessScript, rawTxs, key, index, gift: { ...gift.account, publicKey: gift.publicKey } });
      setBuilt({ plan, psbt, witnessScript });
    } catch (e) {
      setError({ key: problemKey(e) });
    } finally {
      setBusy(false);
    }
  };

  const send = async (input: Uint8Array | string) => {
    if (built === null) return;
    setBusy(true);
    setError(null);
    try {
      const signed = finalizeRecoveryPsbt(readPsbt(input), built.plan, built.witnessScript);
      await api.claim(g.id, signed.hex, 'ahora');
      setDone(true);
      onDone();
    } catch (e) {
      setError({ key: problemKey(e) });
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Notice kind="ok">{t('avanzado.recuperar.listo')}</Notice>;
  const base64 = built === null ? '' : psbtToBase64(built.psbt);
  return (
    <div class="regalo-secretos recupero-psbt">
      <strong>{t('avanzado.recuperar.titulo', { nombre: g.para })}</strong>
      {built === null ? (
        <form
          class="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && address.trim() !== '') void build();
          }}
        >
          <label class="campo">
            <span>{t('avanzado.recuperar.destino')}</span>
            <input type="text" autocomplete="off" spellcheck={false} value={address} onInput={(e) => setAddress((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <Button type="submit" disabled={busy || address.trim() === ''}>
            {t('avanzado.recuperar.armar')}
          </Button>
        </form>
      ) : (
        <>
          <p>{t('avanzado.recuperar.monto', { monto: formatSats(built.plan.amount, lang), comision: formatSats(built.plan.fee, lang) })}</p>
          <div class="avanzado-paso">
            <span class="avanzado-numero">1</span>
            <p>{t('avanzado.recuperar.paso1')}</p>
          </div>
          {/* Un QR estático alcanza para una PSBT chica; con muchas entradas, el archivo. */}
          {base64.length <= 1500 && <Qr text={base64} label={t('avanzado.recuperar.bajar')} />}
          <Button kind="contorno" onClick={() => downloadBytes(`recupero-${g.id}.psbt`, built.psbt)}>
            {t('avanzado.recuperar.bajar')}
          </Button>
          <div class="avanzado-paso">
            <span class="avanzado-numero">2</span>
            <p>{t('avanzado.recuperar.paso2')}</p>
          </div>
          <label class="boton boton-contorno avanzado-archivo">
            {t('avanzado.recuperar.subir')}
            <input
              type="file"
              accept=".psbt,.txt,application/octet-stream,text/plain"
              onChange={async (e) => {
                const file = (e.currentTarget as HTMLInputElement).files?.[0];
                if (file !== undefined && file.size < 200_000) await send(new Uint8Array(await file.arrayBuffer()));
              }}
            />
          </label>
          <label class="campo">
            <span>{t('avanzado.recuperar.pegar')}</span>
            <textarea class="avanzado-clave" rows={3} spellcheck={false} value={signedText} onInput={(e) => setSignedText((e.currentTarget as HTMLTextAreaElement).value)} />
          </label>
          <Button disabled={busy || signedText.trim() === ''} onClick={() => void send(signedText)}>
            {t('avanzado.recuperar.enviar')}
          </Button>
        </>
      )}
      {error !== null && <Notice kind="error">{t(error.key, error.vars)}</Notice>}
      <details class="avanzado-preguntas">
        <summary>{t('avanzado.recuperar.sinWeb')}</summary>
        <p>{t('avanzado.recuperar.sinWebTexto')}</p>
        <RecoveryFileButton gift={g} root={root} network={network} />
      </details>
    </div>
  );
}

/** Baja el archivo de recupero de un regalo multifirma (se arma en el navegador). */
export function RecoveryFileButton({ gift: g, root, network }: { gift: AccountGift; root: Root; network: Network }) {
  const { t } = useI18n();
  const [error, setError] = useState<Key | null>(null);
  const [huella, setHuella] = useState<string | null>(null);
  return (
    <>
      <Button
        kind="contorno"
        onClick={async () => {
          setError(null);
          try {
            const { key, gift, view } = await giftContext(g, root, network);
            const expected = g.rutaRecupero == null ? '' : fingerprintOf(g.rutaRecupero);
            if (key === null || key.fingerprintHex !== expected) {
              setHuella(expected);
              setError('avanzado.recuperar.otraBilletera');
              return;
            }
            downloadText(
              `recupero-${g.id}.txt`,
              recoveryFileText({ id: g.id, address: g.direccion ?? view.direccion, key, index: g.indice as number, gift: gift.account, witnessScript: view.testigo ?? '', site: window.location.origin }),
            );
          } catch (e) {
            setError(problemKey(e));
          }
        }}
      >
        {t('avanzado.archivo')}
      </Button>
      {error !== null && <Notice kind="error">{t(error, { huella: huella ?? '' })}</Notice>}
    </>
  );
}

/**
 * «Recuperar mis regalos» en el panel: con qué llave se recuperan los regalos nuevos. Para verlo o
 * cambiarlo hace falta la clave maestra (la clave de la billetera se guarda cifrada con ella).
 */
export function RecoverySettings({ network, unlock }: { network: Network; unlock: () => Promise<string | null> }) {
  const { t } = useI18n();
  const [root, setRoot] = useState<Root | null>(null);
  const [key, setKey] = useState<RecoveryKey | null | undefined>(undefined);
  const [screen, setScreen] = useState<'estado' | 'intro' | 'conectar'>('estado');
  const [error, setError] = useState(false);

  const open = async () => {
    const master = await unlock();
    if (master === null) return;
    const r = masterRootFromMnemonic(master);
    setRoot(r);
    setKey(await loadRecoveryKey(r, network));
  };
  const save = async (next: RecoveryKey | null) => {
    if (root === null) return;
    setError(false);
    try {
      await saveRecoveryKey(root, next);
      setKey(next);
      setScreen('estado');
    } catch {
      setError(true);
    }
  };
  useEffect(() => setError(false), [screen]);

  return (
    <section class="caja recupero-ajuste">
      <h3>{t('avanzado.panel.titulo')}</h3>
      {key === undefined ? (
        <>
          <p class="texto-suave">{t('avanzado.panel.abrir')}</p>
          <Button kind="contorno" onClick={() => void open()}>
            {t('avanzado.cambiar')}
          </Button>
        </>
      ) : screen === 'intro' ? (
        <AdvancedIntro onUse={() => setScreen('conectar')} onCommon={() => setScreen('estado')} />
      ) : screen === 'conectar' ? (
        <ConnectWallet network={network} onConnected={(k) => void save(k)} />
      ) : (
        <>
          <p>{key === null ? t('avanzado.panel.comun') : t('avanzado.panel.propia', { huella: key.fingerprintHex })}</p>
          {key === null ? (
            <button type="button" class="boton-texto" onClick={() => setScreen('intro')}>
              {t('avanzado.link')}
            </button>
          ) : (
            <div class="avanzado-fila">
              <Button kind="contorno" onClick={() => setScreen('intro')}>
                {t('avanzado.cambiar')}
              </Button>
              <Button kind="contorno" onClick={() => void save(null)}>
                {t('avanzado.panel.volverComun')}
              </Button>
            </div>
          )}
          <p class="texto-suave texto-chico">{t('avanzado.soloNuevos')}</p>
        </>
      )}
      {error && <Notice kind="error">{t('confirmar.error')}</Notice>}
    </section>
  );
}
