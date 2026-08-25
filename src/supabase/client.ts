import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Supabase настроен, только если обе переменные заданы И похожи на настоящие.
 * Приложение обязано работать без них: до этапа 3 всё живёт на локальной
 * IndexedDB, и клон репозитория без `.env.local` не должен падать на старте -
 * он показывает вход в Настройках как «не настроено».
 *
 * Проверяем не только непустоту: `.env.example` копируют целиком и забывают
 * подставить значения, а с плейсхолдером `sb_publishable_...` клиент
 * создастся и отдаст невнятную ошибку от сети вместо честного «не настроено».
 * Заодно это ловит опечатку в имени переменной - typecheck её не видит
 * (у `import.meta.env` индекс `[key: string]: any`, см. `vite-env.d.ts`).
 */
function isConfigured(url?: string, key?: string): boolean {
  if (!url || !key) return false
  if (!url.startsWith('https://')) return false
  // Ключ новой схемы. Legacy anon (JWT, `eyJ...`) тоже рабочий до конца 2026,
  // но проект заводится сразу на новых ключах - сужаем до них осознанно.
  if (!key.startsWith('sb_publishable_')) return false
  // Плейсхолдеры из `.env.example` заканчиваются многоточием.
  return !url.includes('<') && !key.endsWith('...')
}

export const isSupabaseConfigured = isConfigured(url, publishableKey)

/**
 * Ключ publishable (бывший anon) публичен по замыслу: он лежит в бандле,
 * и доступ ограничивают RLS-политики (supabase/migrations/0001_init.sql),
 * а не секретность ключа. Секретный ключ (sb_secret_...) во фронтенде
 * недопустим - он обходит RLS.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        // Сессия переживает перезагрузку и обновляется сама: PWA на айфоне
        // открывают редко, и протухший токен означал бы повторный вход
        // по почте каждый раз.
        persistSession: true,
        autoRefreshToken: true,
        // Magic link возвращает пользователя со ссылкой в URL - её надо
        // разобрать и убрать из адресной строки, чтобы токен не остался
        // в истории браузера.
        detectSessionInUrl: true,
      },
    })
  : null
