import { defineConfig } from 'vite';

// Dirección pública para las vistas previas de links (og:image tiene que ser absoluta). Hasta que
// regalalebitcoin.com apunte al sitio, va web.app; con el dominio: VITE_PUBLIC_URL=https://regalalebitcoin.com
process.env.VITE_PUBLIC_URL ??= 'https://regalalebitcoins.web.app';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  server: {
    port: 5173,
    // En desarrollo la API corre aparte; en producción comparten origen.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    target: 'es2022',
    // Sin módulos inline ni "data:" en el JS: todo sale de archivos del mismo origen.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
