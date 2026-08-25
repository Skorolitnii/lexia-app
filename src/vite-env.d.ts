/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Наши переменные окружения. Объявление СЛИВАЕТСЯ со встроенным
 * `ImportMetaEnv` из vite/client (одноимённые интерфейсы в TS дополняют друг
 * друга), поэтому `MODE`/`DEV`/`PROD` остаются на месте - проверено.
 *
 * Но опечатку в имени это НЕ ловит: у встроенного типа есть индекс
 * `[key: string]: any`, и он перекрывает объявленные поля - `VITE_SUPABSE_URL`
 * проходит typecheck молча (тоже проверено). Поэтому объявление здесь -
 * документация, а не защита; настоящая проверка живёт в рантайме,
 * в `src/supabase/client.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}
