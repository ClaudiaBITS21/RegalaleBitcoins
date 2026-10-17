import { type Destination, isCoreError, type Network, parseDestination } from '@regalale/core';
import { useState } from 'preact/hooks';
import { groupAddress } from '../format.ts';
import type { Key } from '../i18n/index.ts';
import { Button, Notice, StepTitle, useI18n } from '../ui.tsx';

function check(input: string, network: Network, giftAddress: string): { destination: Destination | null; error: Key | null } {
  if (input.trim() === '') return { destination: null, error: null };
  try {
    const destination = parseDestination(input, network);
    if (destination.address === giftAddress) return { destination: null, error: 'direccion.delRegalo' };
    return { destination, error: null };
  } catch (error) {
    if (isCoreError(error, 'WRONG_NETWORK')) return { destination: null, error: 'direccion.otraRed' };
    if (isCoreError(error, 'UNSUPPORTED_ADDRESS')) return { destination: null, error: 'direccion.noSoportada' };
    return { destination: null, error: 'direccion.invalida' };
  }
}

/**
 * La dirección del que recibe. Se valida y se pide comparar el principio y el final
 * con la billetera (protección contra malware que cambia lo copiado).
 */
export function AddressStep({ network, giftAddress, onDone }: { network: Network; giftAddress: string; onDone: (d: Destination) => void }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [blurred, setBlurred] = useState(false);
  const [matches, setMatches] = useState(false);
  const { destination, error } = check(input, network, giftAddress);
  const canPaste = typeof navigator.clipboard?.readText === 'function';

  const change = (value: string) => {
    setInput(value);
    setMatches(false);
  };

  const paste = async () => {
    try {
      change(await navigator.clipboard.readText());
      setBlurred(true);
    } catch {
      // Sin permiso para leer el portapapeles: se pega a mano.
    }
  };

  const address = destination?.address ?? '';
  return (
    <div class="paso">
      <StepTitle>{t('direccion.titulo')}</StepTitle>
      <label class="campo">
        <span>{t('direccion.etiqueta')}</span>
        <div class="campo-con-boton">
          <input
            type="text"
            class="mono"
            value={input}
            placeholder={network.btc.bech32 + '1q…'}
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck={false}
            aria-invalid={error !== null && blurred}
            onInput={(e) => change((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => setBlurred(true)}
          />
          {canPaste && (
            <button type="button" class="boton-chico" onClick={paste}>
              {t('direccion.pegar')}
            </button>
          )}
        </div>
      </label>
      {error !== null && (blurred || input.length > 20) && <Notice kind="error">{t(error)}</Notice>}
      {destination !== null && (
        <>
          <div class="caja">
            <p>{t('direccion.revisa', { inicio: groupAddress(address.slice(0, 8)), fin: groupAddress(address.slice(-8)) })}</p>
            <p class="mono direccion-completa">{groupAddress(address)}</p>
          </div>
          <label class="casilla">
            <input type="checkbox" checked={matches} onChange={(e) => setMatches((e.currentTarget as HTMLInputElement).checked)} />
            {t('direccion.coincide')}
          </label>
        </>
      )}
      <Button disabled={destination === null || !matches} onClick={() => destination !== null && onDone(destination)}>
        {t('seguir')}
      </Button>
    </div>
  );
}
