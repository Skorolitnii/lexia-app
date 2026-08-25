import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-96x96.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lexia',
        short_name: 'Lexia',
        description: 'Изучение английского: карточки с интервальным повторением',
        theme_color: '#e7e5df',
        background_color: '#e7e5df',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Офлайн-навигация: в SPA любой маршрут - это index.html. Без этого
        // открытие установленной PWA без сети даёт ошибку сети вместо
        // приложения, хотя оболочка лежит в прекэше.
        navigateFallback: 'index.html',
        // Запросы к Supabase и словарю НЕ должны отвечать оболочкой: они не
        // навигационные, но `navigateFallback` без этого списка перехватывает
        // и их, подсовывая HTML вместо JSON.
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        runtimeCaching: [
          {
            // Словарные ответы неизменны (§7: кэшировать и троттлить).
            // StaleWhileRevalidate, а не CacheFirst: словарь изредка правят,
            // и фоновое обновление это подхватит, не задерживая ответ.
            urlPattern: ({ url }) => url.hostname === 'api.datamuse.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dictionary-api',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              // «Слово не найдено» у Datamuse - это 200 с пустым массивом, а не
              // 404, поэтому отсеять промах по статусу нельзя. Держим срок
              // кэша, но revalidate подхватит появившееся слово в фоне.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Живой голос произношения. Матчим по типу запроса, а не по хосту:
            // OneLook отдаёт mp3 со своего пути, и привязка к домену
            // сломалась бы при его смене.
            urlPattern: ({ request }) => request.destination === 'audio',
            handler: 'CacheFirst',
            options: {
              cacheName: 'pronunciation-audio',
              // Произношение слова не меняется - CacheFirst без ревалидации.
              // Лимит держит кэш в размере активной колоды: на iPhone
              // распухший Storage вытесняется целиком, вместе с данными.
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              // ТОЛЬКО 200. Непрозрачные ответы (`status: 0`) сюда класть
              // НЕЛЬЗЯ: у них не читается ни тело, ни заголовки, и вместе с
              // `rangeRequests` они не собираются обратно в аудио - `<audio>`
              // падает с `NotSupportedError`. Причём навсегда: CacheFirst
              // отдаёт битую запись и когда сеть есть.
              //
              // Именно так у OneLook и ломалась озвучка на проде (2026-08-19):
              // CORS-заголовков у него нет (§7 спеки), значит ответ ВСЕГДА
              // непрозрачный - первое воспроизведение клало в кэш мусор, и
              // дальше слово молчало на всех устройствах, откатываясь на
              // синтез. Локально бага не видно: в dev service worker выключен.
              //
              // Цена - у OneLook нет офлайн-озвучки (кэшировать нечего).
              // Облачные mp3 из своего Storage приходят с CORS и кэшируются
              // нормально, а офлайн у слова остаётся локальный синтез.
              cacheableResponse: { statuses: [200] },
              // mp3 запрашивается по диапазонам (<audio> шлёт Range) -
              // без плагина такой ответ из кэша не собрать.
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
})
