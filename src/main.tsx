import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from '@/App'
import { AuthGate } from '@/supabase/AuthGate'
import { RepoProvider } from '@/data/RepoProvider'
import { SpeechProvider } from '@/speech/SpeechProvider'
import { ToastProvider } from '@/components/Toast'
import '@fontsource-variable/onest/index.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'

/**
 * Словарные ответы не меняются - кэшируем надолго и не перезапрашиваем
 * при фокусе окна. Это же кэш защищает от шквала запросов при импорте
 * 50+ заметок (§7): повторное слово берётся из памяти.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

/**
 * Разовая чистка кэша произношения от непрозрачных ответов.
 *
 * До 2026-08-19 SW клал в `pronunciation-audio` ответы со `status: 0` (у
 * OneLook нет CORS-заголовков, §7). Такую запись нельзя ни прочитать, ни
 * собрать обратно в аудио - `<audio>` падал с `NotSupportedError`, и слово
 * молчало НАВСЕГДА: CacheFirst отдаёт битую запись даже при живой сети.
 * Правило в `vite.config.ts` теперь кэширует только 200, но у тех, кто уже
 * открывал приложение, мусор лежит в браузере - новая сборка сама его не
 * трогает (`cleanupOutdatedCaches` чистит лишь прекэш).
 *
 * Поэтому подчищаем сами: проходим по записям и удаляем непрозрачные. Чистка
 * идёт один раз - после неё таких записей не появляется. Осечки глотаем: без
 * Cache API (или в приватном режиме) озвучка просто ходит в сеть.
 */
async function dropOpaqueAudioCache() {
  if (!('caches' in window)) return
  try {
    if (!(await caches.has('pronunciation-audio'))) return
    const cache = await caches.open('pronunciation-audio')
    for (const request of await cache.keys()) {
      const hit = await cache.match(request)
      if (hit && (hit.type === 'opaque' || hit.status === 0)) await cache.delete(request)
    }
  } catch {
    // Кэш недоступен - не повод падать при старте.
  }
}
void dropOpaqueAudioCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <AuthGate>
            <RepoProvider>
              <SpeechProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </SpeechProvider>
            </RepoProvider>
          </AuthGate>
        </MotionConfig>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
