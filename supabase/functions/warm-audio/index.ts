// Импорт с префиксом `jsr:` - так его резолвит Deno в рантайме Edge Functions.
// Подчёркивание в редакторе без Deno-режима - настройка, а не код (../README.md).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cloudVoice, ensureAudio, normalize } from '../_shared/tts.ts'

/**
 * Прогрев озвучки для одной заметки - ручное добавление слова в форме (§6).
 *
 * Импорт колоды греется внутри `import-deck`; сюда приходит одиночное
 * сохранение из формы. Смысл тот же: синтез идёт секунды, и без прогрева
 * первый показ карточки встречал бы пользователя лоадером.
 *
 * Идемпотентна: `ensureAudio` не синтезирует повторно то, что уже лежит в
 * бакете, поэтому повторное сохранение заметки квоту не тратит.
 *
 * Отвечает СРАЗУ, не дожидаясь синтеза: результат вызывающему не нужен -
 * при промахе клиент сходит в `tts` сам, как и раньше.
 */

const AZURE_KEY = Deno.env.get('AZURE_SPEECH_KEY')
const AZURE_REGION = Deno.env.get('AZURE_SPEECH_REGION')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

/** Ограничение из функции `tts`: длинные тексты не синтезируем. */
const MAX_CHARS = 500

/** Сколько фраз держим в полёте: у F0 жёсткий лимит запросов в секунду. */
const CONCURRENCY = 3

/**
 * Сколько фраз принимаем за раз. У заметки это слово плюс примеры - десятка
 * хватает с запасом, а верхняя граница держит расход символов предсказуемым.
 */
const MAX_TEXTS = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!AZURE_KEY || !AZURE_REGION) return json({ error: 'tts not configured' }, 503)

  // Без проверки пользователя функция была бы открытым прокси к платному API.
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) {
    console.error(JSON.stringify({ at: 'auth', detail: userError?.message ?? 'no user' }))
    return json({ error: 'unauthorized' }, 401)
  }

  let body: { texts?: unknown; region?: unknown; rate?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  if (!Array.isArray(body.texts)) return json({ error: 'bad texts' }, 400)

  const texts = [
    ...new Set(
      body.texts
        .filter((t): t is string => typeof t === 'string')
        .map(normalize)
        .filter((t) => t.length > 0 && t.length <= MAX_CHARS),
    ),
  ].slice(0, MAX_TEXTS)

  if (texts.length === 0) return json({ warmed: 0 })

  const region = body.region === 'uk' ? 'uk' : 'us'
  const rate = typeof body.rate === 'number' && body.rate >= 0.5 && body.rate <= 2 ? body.rate : 1
  const voice = cloudVoice(region)

  const warm = async () => {
    let next = 0
    let failed = 0
    const worker = async () => {
      while (next < texts.length) {
        const text = texts[next++]!
        try {
          await ensureAudio(db, text, voice, rate, { key: AZURE_KEY!, region: AZURE_REGION! })
        } catch (e) {
          // Осечка одной фразы не должна ронять остальные: прогрев
          // спекулятивен, при промахе клиент сходит в `tts` сам.
          failed++
          if (failed <= 3) {
            console.error(JSON.stringify({ at: 'warm', chars: text.length, detail: String(e) }))
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, texts.length) }, worker))
  }

  // Отвечаем сразу, синтез продолжается в фоне: вызывающему результат не
  // нужен, а держать форму сохранения открытой на время синтеза незачем.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  if (runtime) runtime.waitUntil(warm())
  else await warm()

  return json({ warmed: texts.length })
})
