import { parseGiftLink } from './giftlink.ts';
import { useState } from 'preact/hooks';
import { ALLOW_MAINNET } from './config.ts';
import { Button, Layout, Notice, StepTitle, useI18n } from './ui.tsx';

/**
 * "Abrir un regalo": para quien no puede tocar el link (lo tiene en papel o en otra
 * pantalla). Se pega el link y se abre en este mismo sitio; la semilla del # nunca
 * viaja al servidor.
 */
export function OpenGiftPage() {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <Layout testnet={!ALLOW_MAINNET}>
      <form
        class="paso"
        autocomplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const target = parseGiftLink(value);
          if (target === null) {
            setInvalid(true);
            return;
          }
          window.location.assign(target);
        }}
      >
        <StepTitle>{t('abrir.titulo')}</StepTitle>
        <p class="texto-suave">{t('abrir.texto')}</p>
        <label class="campo">
          <span>{t('abrir.etiqueta')}</span>
          <input
            type="url"
            value={value}
            autocapitalize="none"
            autocorrect="off"
            spellcheck={false}
            onInput={(e) => {
              setValue((e.currentTarget as HTMLInputElement).value);
              setInvalid(false);
            }}
          />
        </label>
        {invalid && <Notice kind="error">{t('abrir.invalido')}</Notice>}
        <Button type="submit" disabled={value.trim() === ''}>
          {t('abrir.cta')}
        </Button>
        <p class="texto-suave">{t('abrir.palabras')}</p>
      </form>
    </Layout>
  );
}
