import { defineConfig, type Plugin } from 'vite';

// Herramienta sin conexión: un único HTML con todo adentro (JS y CSS en línea), para guardarlo y
// abrirlo sin internet. Sale en dist-offline/offline.html; build:mainnet la copia al sitio.

/** Mete el JS del bundle dentro del HTML y borra el archivo suelto. */
function inline(): Plugin {
  return {
    name: 'en-linea',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
      if (html === undefined || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const tag = new RegExp(`<script type="module" crossorigin src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`);
        // Como función, para que los "$" del código no se lean como patrones de reemplazo.
        source = source.replace(tag, () => `<script type="module">${chunk.code.replace(/<\/script/gi, '<\\/script')}</script>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  plugins: [inline()],
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-offline',
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    rolldownOptions: { input: 'offline.html' },
  },
});
