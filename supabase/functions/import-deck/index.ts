// Импорты с префиксами `jsr:`/`npm:` - так их резолвит Deno в рантайме Edge
// Functions. Редактор без включённого Deno-режима подчёркивает эти строки
// (TS2307); как убрать - написано в ../README.md.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { createEmptyCard } from 'npm:ts-fsrs@5.4.1'
import { cloudVoice, ensureAudio, normalize } from '../_shared/tts.ts'

/**
 * Импорт колоды целиком - одной ручкой (§8 этап 7).
 *
 * Раньше это делал фронт: на колоду из 50 слов он слал 50 запросов в Datamuse
 * (по 4 в полёте), потом два запроса на запись, а озвучка синтезировалась
 * лениво - по одной фразе на первом показе карточки. С телефона это заметно:
 * шквал запросов, долгое «обогащение…», а первые карточки всё равно встречали
 * лоадером.
 *
 * Теперь фронт шлёт разобранную колоду один раз и получает результат. Здесь:
 *   1. дубликаты - по тому же правилу, что и превью (front в целевой папке);
 *   2. словарь (транскрипции) - параллельно, с сервера;
 *   3. запись notes + cards;
 *   4. прогрев озвучки: слова и примеры сразу уезжают в Azure и ложатся в
 *      бакет, поэтому к моменту показа карточки mp3 уже готов.
 *
 * Прогрев идёт ПОСЛЕ ответа (`EdgeRuntime.waitUntil`): импорт не должен ждать
 * синтеза полусотни фраз, а озвучка не обязана быть готова в ту же секунду -
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

/** Заметка колоды - ровно то, что отдаёт `parseDeck` на фронте. */
interface DeckNote {
  type: 'basic' | 'cloze'
  front: string
  back: string | null
  details: string | null
  examples: { text: string; translation?: string }[]
  reverse: boolean
  tags: string[]
}

// --- Словарь ---------------------------------------------------------------

/**
 * Словарный лукап осмыслен только для отдельных слов (§4). Правила ДОСЛОВНО
 * те же, что в `src/dictionary/api.ts`: дефис и апостроф - часть слова,
 * ведущее «to » срезается (глаголы в колодах пишут как «to stir»).
 */
const LATIN_WORD = /^[\p{Script=Latin}][\p{Script=Latin}\p{Mn}'-]*$/u
const INFINITIVE_TO = /^to\s+/i

function lookupTerm(front: string): string | null {
  const word = front.trim().replace(INFINITIVE_TO, '')
  return word.length > 0 && LATIN_WORD.test(word) ? word.toLowerCase() : null
}

/**
 * Транскрипция из Datamuse. Флаг `r` обязателен: без него транскрипции нет
 * вовсе, а `ipa=1` лишь меняет её формат с ARPAbet на IPA.
 *
 * Любая осечка - это `null`, а не отказ импорта: «слова нет в словаре» -
 * нормальный исход (§4), и заметка создаётся без транскрипции.
 */
async function transcriptionFor(front: string): Promise<string | null> {
  const term = lookupTerm(front)
  if (!term) return null

  const query = new URLSearchParams({ sp: term, md: 'dpr', ipa: '1', max: '1' })
  try {
    const res = await fetch(`https://api.datamuse.com/words?${query}`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // 404 у Datamuse не бывает: неизвестное слово - это пустой массив.
    if (!Array.isArray(data) || data.length === 0) return null
    const tags: string[] = data[0]?.tags ?? []
    const ipa = tags.find((t) => t.startsWith('ipa_pron:'))?.slice('ipa_pron:'.length)
    // Datamuse отдаёт IPA без косых скобок - добавляем, как принято в словарях.
    return ipa ? `/${ipa}/` : null
  } catch {
    return null
  }
}

/** Сколько задач держим в полёте: и для словаря, и для синтеза. */
const CONCURRENCY = 4

/** Выполнить задачи пулом, сохраняя порядок результатов. */
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      result[i] = await run(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return result
}

// --- Прогрев озвучки -------------------------------------------------------

/** Убрать разметку пропусков: `{{ответ::подсказка}}` → `ответ`. */
function clozePlainText(front: string): string {
  return front.replace(/\{\{([^}]*)\}\}/g, (_, inner: string) => inner.split('::')[0] ?? '')
}

/** Ограничение из функции `tts`: длинные тексты не синтезируем. */
const MAX_CHARS = 500

/**
 * Все фразы заметки, которые стоит озвучить заранее: главный текст карточки и
 * примеры. Перевода примеров тут нет - он русский, озвучка ему не нужна.
 */
function speakTexts(note: DeckNote): string[] {
  const main = note.type === 'cloze' ? clozePlainText(note.front) : note.front
  const texts = [main, ...note.examples.map((e) => e.text)]
  return texts.map(normalize).filter((t) => t.length > 0 && t.length <= MAX_CHARS)
}

/**
 * Синтезировать озвучку всей колоды. Осечки глотаем по одной: прогрев
 * спекулятивен, и упавший синтез одной фразы не должен ронять остальные -
 * при промахе клиент сходит в `tts` сам.
 *
 * Дедупим тексты: одно и то же слово могло встретиться в примерах соседней
 * заметки, а каждый лишний синтез - это символы из месячной квоты.
 */
async function warmAudio(
  db: SupabaseClient,
  notes: DeckNote[],
  region: string,
  rate: number,
): Promise<void> {
  if (!AZURE_KEY || !AZURE_REGION) return

  const voice = cloudVoice(region)
  const texts = [...new Set(notes.flatMap(speakTexts))]

  let failed = 0
  await pool(texts, CONCURRENCY, async (text) => {
    try {
      await ensureAudio(db, text, voice, rate, { key: AZURE_KEY, region: AZURE_REGION })
    } catch (e) {
      failed++
      // Первые несколько осечек логируем подробно, дальше только считаем:
      // при исчерпанной квоте иначе в лог уедет вся колода одинаковых строк.
      if (failed <= 3) {
        console.error(JSON.stringify({ at: 'warm', chars: text.length, detail: String(e) }))
      }
    }
  })

  console.log(JSON.stringify({ at: 'warm', phrases: texts.length, failed }))
}

// --- Запись ----------------------------------------------------------------

/** Ключ, по которому ищем дубликаты: то же слово в той же папке (§4). */
const duplicateKey = (front: string) => front.trim().toLowerCase()

/** Направления карточек заметки (§3). */
function directionsFor(note: DeckNote): string[] {
  if (note.type === 'cloze') return ['cloze']
  return note.reverse ? ['forward', 'reverse'] : ['forward']
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  // service_role обходит RLS - это нужно для записи в бакет озвучки. Строки
  // заметок при этом пишем с ЯВНЫМ `user_id` проверенного пользователя:
  // без RLS `default auth.uid()` не сработает, и колода легла бы ничьей.
  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) {
    console.error(JSON.stringify({ at: 'auth', detail: userError?.message ?? 'no user' }))
    return json({ error: 'unauthorized' }, 401)
  }
  const userId = userData.user.id

  let body: { notes?: unknown; folderId?: unknown; region?: unknown; rate?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  if (!Array.isArray(body.notes)) return json({ error: 'bad notes' }, 400)
  // Разбор и валидация формата - на фронте (`parseDeck`): он же показывает
  // пользователю брак построчно. Сюда приходит уже разобранное, и наша забота -
  // границы, а не формат.
  if (body.notes.length > 500) return json({ error: 'too many notes' }, 400)
  const notes = body.notes as DeckNote[]

  const folderId = typeof body.folderId === 'string' ? body.folderId : null
  const region = body.region === 'uk' ? 'uk' : 'us'
  const rate = typeof body.rate === 'number' && body.rate >= 0.5 && body.rate <= 2 ? body.rate : 1

  if (notes.length === 0) return json({ created: 0, skipped: 0 })

  // Дубликаты считаем по ЖИВЫМ заметкам целевой папки. Осознанно без
  // удалённых: слово, которое пользователь сам удалил, должно импортироваться
  // заново, иначе колода молча приедет неполной (та же логика, что была на
  // фронте).
  const base = db.from('notes').select('front').eq('user_id', userId).eq('deleted', false)
  const { data: existing, error: existingError } = await (folderId
    ? base.eq('folder_id', folderId)
    : base.is('folder_id', null))

  if (existingError) {
    console.error(JSON.stringify({ at: 'existing', detail: existingError.message }))
    return json({ error: 'lookup failed' }, 500)
  }

  const taken = new Set((existing ?? []).map((n) => duplicateKey(n.front as string)))

  // Дубликаты внутри самого файла ловятся тем же множеством: первая заметка
  // «занимает» ключ, следующая с тем же словом уже видит его.
  const fresh: DeckNote[] = []
  for (const note of notes) {
    const key = duplicateKey(note.front)
    if (taken.has(key)) continue
    taken.add(key)
    fresh.push(note)
  }

  const skipped = notes.length - fresh.length
  if (fresh.length === 0) return json({ created: 0, skipped })

  // Словарь: транскрипции тянем параллельно, но пулом - импорт 50+ заметок в
  // один залп это шквал на публичный API (§7).
  const transcriptions = await pool(fresh, CONCURRENCY, (note) =>
    note.type === 'basic' ? transcriptionFor(note.front) : Promise.resolve(null),
  )

  const noteRows = fresh.map((note, i) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    folder_id: folderId,
    type: note.type,
    front: note.front,
    back: note.back,
    transcription: transcriptions[i],
    // Файл нейросети аудио не присылает (§4) - озвучку синтезирует облако
    // по тексту заметки.
    audio_url: null,
    image_url: null,
    details: note.details,
    examples: note.examples,
    reverse: note.reverse,
    tags: note.tags,
  }))

  // Заметки - одним запросом, карточки - вторым. Одной транзакции на два
  // запроса PostgREST не даёт; обратный порядок упал бы на внешнем ключе.
  const { error: notesError } = await db.from('notes').insert(noteRows)
  if (notesError) {
    console.error(JSON.stringify({ at: 'insert-notes', detail: notesError.message }))
    return json({ error: 'insert failed' }, 500)
  }

  // Пустая карточка FSRS - из ts-fsrs, а не собранная руками: набор полей и
  // их значения принадлежат библиотеке, и повторять их здесь значило бы
  // разъехаться с ней при следующем обновлении.
  const empty = createEmptyCard(new Date())
  const cardRows = fresh.flatMap((note, i) =>
    directionsFor(note).map((direction) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      note_id: noteRows[i]!.id,
      direction,
      due: empty.due.toISOString(),
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: null,
      learning_steps: empty.learning_steps ?? 0,
      suspended: false,
      deleted: false,
    })),
  )

  const { error: cardsError } = await db.from('cards').insert(cardRows)
  if (cardsError) {
    // Заметки уже записаны. Чинится повторным сохранением заметки в UI,
    // поэтому это не повод отменять импорт - но знать об этом надо.
    console.error(JSON.stringify({ at: 'insert-cards', detail: cardsError.message }))
    return json({ error: 'cards failed', created: fresh.length, skipped }, 500)
  }

  // Прогрев - после ответа: импорт не должен ждать синтеза полусотни фраз.
  // `EdgeRuntime.waitUntil` держит инстанс живым, пока фоновая работа не
  // закончится; без него рантайм убил бы её сразу после `return`.
  const warm = warmAudio(db, fresh, region, rate)
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  if (runtime) runtime.waitUntil(warm)
  else await warm

  return json({ created: fresh.length, skipped })
})
