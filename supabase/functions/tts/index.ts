// Импорт с префиксом `jsr:` - так его резолвит Deno в рантайме Edge Functions.
// Редактор без включённого Deno-режима подчёркивает эту строку (TS2307):
// он резолвит по node_modules, где такого пакета нет. Это ошибка настройки
// редактора, а не кода - как её убрать, написано в ../README.md.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { AzureError, ensureAudio } from '../_shared/tts.ts'

/**
 * Облачный синтез по требованию (§6). Клиент зовёт функцию только при промахе
 * кэша: сначала он играет предполагаемый адрес в Storage напрямую, и попадание
 * сюда вообще не доходит. Основная масса озвучки синтезируется заранее, при
 * импорте (`import-deck`), - сюда попадает то, что прогрев не покрыл.
 *
 * Зачем функция, а не запрос из браузера: ключ Azure нельзя класть во
 * фронтенд - бандл публичен. Здесь он живёт в переменных окружения проекта.
 *
 * Ответ всегда `{ url }` либо ошибка: клиент при любой осечке молча
 * откатывается на локальный синтез, поэтому падение функции ломает качество
 * озвучки, но не саму озвучку.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!AZURE_KEY || !AZURE_REGION) {
    return json({ error: 'tts not configured' }, 503)
  }

  // Без проверки пользователя функция была бы открытым прокси к платному API:
  // любой, кто нашёл URL, тратил бы нашу квоту. Publishable-ключ в заголовке
  // этого не даёт - он общий для всех, поэтому проверяем именно JWT сессии.
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  // Клиент на service_role: он обходит RLS, что и нужно для записи в бакет.
  // Заголовок пользователя ему НЕ передаём - иначе `service_role` подменился
  // бы токеном сессии и upload упёрся бы в политики.
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Именно `getUser(token)`, а не `getClaims`: последний у клиента на
  // service_role проверяет ключ самого клиента (тот тоже валидный JWT), а не
  // переданный аргумент, и отвечал 401 на живую сессию.
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    console.error(JSON.stringify({ at: 'auth', detail: userError?.message ?? 'no user' }))
    return json({ error: 'unauthorized' }, 401)
  }

  let body: { text?: unknown; voice?: unknown; rate?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  const text = typeof body.text === 'string' ? body.text : ''
  const voice = typeof body.voice === 'string' ? body.voice : ''
  const rate = typeof body.rate === 'number' && isFinite(body.rate) ? body.rate : 1

  // Ограничения на вход: озвучиваются фразы и предложения из колоды, а не
  // произвольные тексты. Верхняя граница держит расход символов предсказуемым.
  if (!text.trim() || text.length > 500) return json({ error: 'bad text' }, 400)
  if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+$/.test(voice)) return json({ error: 'bad voice' }, 400)
  if (rate < 0.5 || rate > 2) return json({ error: 'bad rate' }, 400)

  try {
    // Ключ файла считается ВНУТРИ, а не берётся из запроса. Присланный
    // клиентом путь - это управление именем объекта в бакете: подменив его,
    // можно было бы затереть чужую озвучку или насорить мусорными файлами.
    const url = await ensureAudio(supabase, text, voice, rate, {
      key: AZURE_KEY,
      region: AZURE_REGION,
    })
    return json({ url })
  } catch (e) {
    if (e instanceof AzureError) {
      // Лог одной строкой с разбором: по нему видно, что чинить, без копания
      // в сыром ответе. `detail` - объяснение самого Azure.
      console.error(
        JSON.stringify({
          at: 'synthesize',
          azure_status: e.status,
          reason: e.reason,
          retryable: e.retryable,
          voice,
          chars: text.length,
          detail: e.detail,
        }),
      )
      // Статус наружу разный, чтобы в devtools было видно причину:
      // 429 - квота (ждать), 502 - всё остальное. Клиент в любом случае
      // откатится на локальный синтез.
      const status = e.status === 429 ? 429 : 502
      return json({ error: e.reason, azure_status: e.status, retryable: e.retryable }, status)
    }
    // Синтез уже оплачен, а файл не лёг - следующий показ той же фразы
    // заплатит снова. Поэтому логируем отдельно от ошибок синтеза.
    console.error(JSON.stringify({ at: 'upload', detail: String(e) }))
    return json({ error: 'upload failed' }, 500)
  }
})
