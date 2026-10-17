import { useI18n } from '../ui.tsx';

// Las 4 palabras de un regalo, cada una con su número: el orden importa (forman la contraseña
// en ese orden), así que siempre se muestran como "Palabra 1", "Palabra 2"…

export function WordsList({ words }: { words: readonly string[] }) {
  const { t } = useI18n();
  return (
    <ol class="palabras-regalo" translate={false}>
      {words.map((w, i) => (
        <li key={i}>
          <span class="palabra-n">{t('palabras.etiqueta', { n: String(i + 1) })}</span>
          <strong>{w}</strong>
        </li>
      ))}
    </ol>
  );
}

/** Para mandar por WhatsApp o mail: "1. casa  2. luna  3. …", en orden. */
export function numberedWords(words: readonly string[]): string {
  return words.map((w, i) => `${i + 1}. ${w}`).join('   ');
}
