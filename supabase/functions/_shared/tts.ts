/**
 * Синтез речи в Azure и его кэш в Storage. Общий модуль двух функций: `tts`
 * (озвучка по требованию, промах кэша на клиенте) и `import-deck` (прогрев
 * всей колоды сразу после импорта).
 *
 * До появления этого файла формула ключа жила в трёх местах - здесь, в
 * функции `tts` и в `src/speech/cloudTts.ts`. Разъедутся любые две - клиент
 * будет вечно мазать мимо кэша, а функция синтезировать заново на каждый
 * показ карточки, и тесты при этом останутся зелёными. Клиентскую копию
 * убрать нельзя (она обязана быть синхронной ради жеста пользователя на iOS),
 * но серверные свёрнуты в одну.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const BUCKET = 'tts'

/** Голоса Azure под регион озвучки. Те же, что знает клиент. */
const VOICES: Record<string, string> = {
  us: 'en-US-AvaMultilingualNeural',
  uk: 'en-GB-SoniaNeural',
}

export function cloudVoice(region: string): string {
  return VOICES[region] ?? VOICES.us!
}

/** Та же нормализация, что в `src/speech/cloudTts.ts` - иначе ключи разойдутся. */
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Ключ файла в бакете. Формула ДОСЛОВНО та же, что в `src/speech/cloudTts.ts`
 * (там же объяснено, почему хэш не криптографический).
 */
export function cacheKey(text: string, voice: string, rate: number): string {
  const payload = `${normalize(text)}|${voice}|${rate.toFixed(2)}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x85ebca6b)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h1) + hex(h2)
}

/** Экранирование для SSML: текст приходит из колоды и может содержать `&`, `<`. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Отказ Azure, разобранный до состояния, с которым можно что-то делать.
 * `retryable` - осечка, которая сама пройдёт (лимит запросов в секунду,
 * временный сбой); всё остальное требует вмешательства.
 */
export class AzureError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    readonly retryable: boolean,
    readonly detail: string,
  ) {
    super(`azure ${status}: ${reason}`)
  }
}

/**
 * Разбор кода ответа Azure. Различать их важно: в общем «не получилось» тонет
 * разница между «кончилась месячная квота» (ждать до следующего месяца или
 * платить) и «ключ протух» (пойти в портал и скопировать заново).
 */
function classify(status: number, detail: string): AzureError {
  switch (status) {
    case 400:
      return new AzureError(status, 'bad request (SSML or voice name)', false, detail)
    case 401:
    case 403:
      return new AzureError(status, 'key rejected - check AZURE_SPEECH_KEY/REGION', false, detail)
    case 429:
      // У F0 это и лимит в секунду, и исчерпанная месячная квота: коды
      // одинаковые, различить можно только по тому, отпустит ли через минуту.
      return new AzureError(status, 'rate limited or monthly quota exhausted', true, detail)
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return new AzureError(status, 'azure temporarily unavailable', true, detail)
    default:
      return new AzureError(status, 'unexpected azure response', status >= 500, detail)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface AzureConfig {
  key: string
  region: string
}

/**
 * Синтез в Azure. Скорость передаём через `prosody`: облако запекает её в файл
 * (поэтому скорость и входит в ключ кэша).
 *
 * Сетевые сбои и «попробуйте позже» повторяем дважды с нарастающей паузой:
 * у F0 жёсткий лимит запросов в секунду. Отказы, которые сами не пройдут
 * (битый ключ, плохой SSML), не повторяем - это только задержало бы фолбэк.
 */
export async function synthesize(
  text: string,
  voice: string,
  rate: number,
  azure: AzureConfig,
): Promise<ArrayBuffer> {
  const lang = voice.slice(0, 5)
  const percent = Math.round((rate - 1) * 100)
  const ssml =
    `<speak version="1.0" xml:lang="${lang}">` +
    `<voice name="${voice}">` +
    `<prosody rate="${percent >= 0 ? '+' : ''}${percent}%">${escapeXml(text)}</prosody>` +
    `</voice></speak>`

  let last: AzureError | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    // Ожидание перед повтором: 0 - 400мс - 1600мс.
    if (attempt > 0) await sleep(400 * attempt * attempt)

    let res: Response
    try {
      res = await fetch(`https://${azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'ocp-apim-subscription-key': azure.key,
          'content-type': 'application/ssml+xml',
          // 24 kHz / 48 kbps: речь на телефоне неотличима от более жирных
          // пресетов, а файл втрое легче.
          'x-microsoft-outputformat': 'audio-24khz-48kbitrate-mono-mp3',
          'user-agent': 'lexia-tts',
        },
        body: ssml,
        signal: AbortSignal.timeout(10_000),
      })
    } catch (e) {
      last = new AzureError(0, 'network error or timeout', true, String(e))
      continue
    }

    if (res.ok) {
      const audio = await res.arrayBuffer()
      // Пустой ответ со статусом 200 - записать нулевой mp3 в кэш хуже, чем не
      // записать ничего: карточка молчала бы навсегда, а фолбэк бы не
      // сработал (файл-то есть).
      if (audio.byteLength === 0) {
        last = new AzureError(200, 'empty audio', true, '')
        continue
      }
      return audio
    }

    const detail = await res.text().catch(() => '')
    last = classify(res.status, detail.slice(0, 300))
    if (!last.retryable) break
  }

  throw last ?? new AzureError(0, 'synthesis failed', false, '')
}

/** Лежит ли файл в бакете. */
export async function exists(db: SupabaseClient, path: string): Promise<boolean> {
  const { data } = await db.storage.from(BUCKET).list('', { search: path, limit: 1 })
  return data?.some((f) => f.name === path) ?? false
}

/**
 * Синтезировать фразу и положить в бакет, если её там ещё нет. Возвращает
 * публичный URL готового файла.
 *
 * Проверка «файл уже есть» тут не дублирование клиентской: два устройства
 * могут запросить одну фразу почти одновременно, и оба промахнутся мимо кэша.
 * Без неё это два платных синтеза вместо одного.
 */
export async function ensureAudio(
  db: SupabaseClient,
  text: string,
  voice: string,
  rate: number,
  azure: AzureConfig,
): Promise<string> {
  const path = `${cacheKey(text, voice, rate)}.mp3`
  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)

  if (await exists(db, path)) return pub.publicUrl

  const audio = await synthesize(text, voice, rate, azure)

  // `upsert: true` - гонка двух устройств: пока мы синтезировали, файл мог
  // появиться. Содержимое у одного ключа одинаковое, перезапись безобидна.
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: 'audio/mpeg', upsert: true })

  if (error) throw new Error(`upload failed: ${error.message}`)
  return pub.publicUrl
}
