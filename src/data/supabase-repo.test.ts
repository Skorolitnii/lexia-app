import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseRepository } from '@/data/supabase-repo'
import type { CardRow, NoteRow } from '@/types'

/**
 * Фейковый PostgREST: пишет в память и записывает журнал вызовов.
 *
 * Реальный клиент строит запрос цепочкой (`.from().update().eq()`), а
 * результат отдаёт только при await - поэтому каждое звено возвращает сам
 * объект, а `then` разрешает накопленный запрос. Проверяем не SQL, а
 * поведение репозитория: что и в каком порядке он трогает.
 */
interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
}

/** Лимит PostgREST из `supabase/config.toml` - превышение режется молча. */
const MAX_ROWS = 1000

function fakeClient(tables: Record<string, unknown[]>) {
  const calls: Call[] = []

  const from = (table: string) => {
    let op: Call['op'] = 'select'
    let payload: unknown
    const filters: ((row: Record<string, unknown>) => boolean)[] = []
    let single = false
    let rangeFrom: number | null = null
    let rangeTo: number | null = null
    // `head: true` + `count: 'exact'`: настоящий PostgREST не шлёт строки, а
    // возвращает только число в поле `count`. Фейк обязан вести себя так же.
    let headCount = false

    const rows = () =>
      (tables[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>)))

    const q = {
      select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) headCount = true
        return q
      },
      insert: (v: unknown) => {
        op = 'insert'
        payload = v
        const list = Array.isArray(v) ? v : [v]
        tables[table] = [...(tables[table] ?? []), ...list]
        return q
      },
      update: (v: unknown) => {
        op = 'update'
        payload = v
        return q
      },
      delete: () => {
        op = 'delete'
        return q
      },
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value)
        return q
      },
      // Именно список, а не первый элемент: `syncCards` гасит все лишние
      // направления одним `.in()`, и «матчим только первое» скрыло бы это.
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]))
        return q
      },
      // Массив тегов: contains('tags', [t]) - тег входит в text[] заметки.
      contains: (col: string, values: unknown[]) => {
        filters.push((r) => {
          const arr = r[col]
          return Array.isArray(arr) && values.every((v) => arr.includes(v))
        })
        return q
      },
      // PostgREST or-строка вида `front.ilike.%x%,back.ilike.%x%`: разбираем в
      // набор ИЛИ-условий. Поддерживаем ровно то, что использует репозиторий -
      // ilike; иначе фейк был бы «добрее» и пропускал бы ошибки.
      or: (expr: string) => {
        const clauses = expr.split(',').map((c) => {
          const [col, opName, ...rest] = c.split('.')
          const value = rest.join('.')
          if (opName !== 'ilike') throw new Error(`fake: unsupported or-op ${opName}`)
          const needle = value.replace(/%/g, '').toLowerCase()
          return (r: Record<string, unknown>) =>
            String(r[col!] ?? '')
              .toLowerCase()
              .includes(needle)
        })
        filters.push((r) => clauses.some((f) => f(r)))
        return q
      },
      gte: () => q,
      not: () => q,
      order: () => q,
      // Постраничное чтение: репозиторий обходит лимит PostgREST в 1000 строк,
      // и фейк обязан резать так же - иначе пагинация не проверяется вовсе.
      range: (from: number, to: number) => {
        rangeFrom = from
        rangeTo = to
        return q
      },
      single: () => {
        single = true
        return q
      },
      maybeSingle: () => {
        single = true
        return q
      },
      then: (resolve: (r: { data: unknown; count?: number; error: null }) => unknown) => {
        calls.push({ table, op, payload })
        // head + count: только число, тел строк нет (как настоящий PostgREST).
        if (headCount) {
          return resolve({ data: null, count: rows().length, error: null })
        }
        // Отдаём КОПИИ, как настоящий PostgREST: он присылает JSON, а не ссылку
        // на строку в базе. Общий объект ломал бы `updateNote`, где `prev`
        // обязан быть снимком ДО записи - иначе сравнение с патчем всегда
        // показывает «изменений нет».
        const copy = (r: unknown) => ({ ...(r as object) })
        if (op === 'update') {
          const updated = rows().map((r) => Object.assign(r as object, payload))
          const out = updated.map(copy)
          return resolve({ data: single ? (out[0] ?? null) : out, error: null })
        }
        if (op === 'insert') {
          const list = (Array.isArray(payload) ? payload : [payload]).map(copy)
          return resolve({ data: single ? (list[0] ?? null) : list, error: null })
        }
        if (op === 'delete') {
          const doomed = new Set(rows())
          tables[table] = (tables[table] ?? []).filter((r) => !doomed.has(r))
          return resolve({ data: [], error: null })
        }
        // БЕЗ `range` режем на MAX_ROWS, как настоящий PostgREST, - молча.
        // Если фейк отдаст всё сразу, тест на пагинацию пройдёт и на коде без
        // пагинации, то есть не будет проверять ничего (проверено мутацией).
        let found = rows().map(copy)
        found =
          rangeFrom !== null && rangeTo !== null
            ? found.slice(rangeFrom, rangeTo + 1)
            : found.slice(0, MAX_ROWS)
        return resolve({ data: single ? (found[0] ?? null) : found, error: null })
      },
    }
    return q
  }

  return { client: { from } as unknown as SupabaseClient, calls, tables }
}

const note = (over: Partial<NoteRow> = {}): NoteRow => ({
  id: 'n1',
  user_id: 'u1',
  folder_id: null,
  type: 'basic',
  front: 'otter',
  back: 'выдра',
  transcription: null,
  audio_url: null,
  image_url: null,
  details: null,
  examples: [],
  reverse: false,
  tags: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted: false,
  ...over,
})

describe('SupabaseRepository', () => {
  it('не шлёт user_id: его проставляет сервер через default auth.uid()', async () => {
    const { client, calls } = fakeClient({ notes: [], cards: [] })
    const input = { ...note() }
    delete (input as Partial<NoteRow>).user_id
    delete (input as Partial<NoteRow>).created_at
    delete (input as Partial<NoteRow>).updated_at
    delete (input as Partial<NoteRow>).deleted
    await new SupabaseRepository(client).createNote(input)

    const inserted = calls.filter((c) => c.op === 'insert')
    for (const call of inserted) {
      const rows = Array.isArray(call.payload) ? call.payload : [call.payload]
      for (const row of rows) {
        expect(row).not.toHaveProperty('user_id')
      }
    }
  })

  it('заметку пишет раньше карточек - иначе внешний ключ note_id не разрешится', async () => {
    const { client, calls } = fakeClient({ notes: [], cards: [] })
    await new SupabaseRepository(client).createNotes([{ ...note(), reverse: true } as never])

    const order = calls.filter((c) => c.op === 'insert').map((c) => c.table)
    expect(order).toEqual(['notes', 'cards'])
  })

  it('deleteNote гасит карточки раньше заметки - чтобы не осталось сирот в очереди', async () => {
    const { client, calls } = fakeClient({
      notes: [note()],
      cards: [{ id: 'c1', note_id: 'n1', deleted: false }],
    })
    await new SupabaseRepository(client).deleteNote('n1')

    const order = calls.filter((c) => c.op === 'update').map((c) => c.table)
    expect(order).toEqual(['cards', 'notes'])
  })

  it('deleteFolder обнуляет folder_id у слов и лишь потом гасит папку', async () => {
    // §3: `folder_id on delete set null`. Мягкое удаление FK-каскад не запускает,
    // поэтому слова обнуляем сами. Порядок (слова → папка) как везде на сервере:
    // обрыв не оставит слово, указывающее на исчезнувшую папку.
    const { client, calls, tables } = fakeClient({
      folders: [{ id: 'f1', deleted: false }],
      notes: [note({ id: 'n1', folder_id: 'f1' }), note({ id: 'n2', folder_id: 'f1' })],
    })

    await new SupabaseRepository(client).deleteFolder('f1')

    const order = calls.filter((c) => c.op === 'update').map((c) => c.table)
    expect(order).toEqual(['notes', 'folders'])
    expect((tables.notes as NoteRow[]).every((n) => n.folder_id === null)).toBe(true)
    expect((tables.folders[0] as { deleted: boolean }).deleted).toBe(true)
  })

  it('deleteFolder(withNotes) гасит карточки, слова и папку - именно в этом порядке', async () => {
    // Со словами: карточки → слова → папка (как `deleteNote`, чтобы обрыв не
    // оставил осиротевшие карточки в очереди). Карточки берём по note_id слов
    // папки, а не по folder_id (у карточек его нет).
    const { client, calls, tables } = fakeClient({
      folders: [{ id: 'f1', deleted: false }],
      notes: [note({ id: 'n1', folder_id: 'f1' }), note({ id: 'n2', folder_id: 'f1' })],
      cards: [
        { id: 'c1', note_id: 'n1', deleted: false },
        { id: 'c2', note_id: 'n2', deleted: false },
      ],
    })

    await new SupabaseRepository(client).deleteFolder('f1', true)

    const order = calls.filter((c) => c.op === 'update').map((c) => c.table)
    expect(order).toEqual(['cards', 'notes', 'folders'])
    expect((tables.cards as { deleted: boolean }[]).every((c) => c.deleted)).toBe(true)
    expect((tables.notes as NoteRow[]).every((n) => n.deleted)).toBe(true)
    expect((tables.folders[0] as { deleted: boolean }).deleted).toBe(true)
  })

  it('включение reverse оживляет ту же строку, а не вставляет вторую', async () => {
    // unique (note_id, direction) в схеме: вставка второй reverse-строки
    // упала бы на констрейнте. Проверяем, что идём через update по её id.
    const buried: Partial<CardRow> = {
      id: 'c-reverse',
      note_id: 'n1',
      direction: 'reverse',
      deleted: true,
    }
    // В базе заметка ЕЩЁ без обратной - иначе `updateNote` не увидит смены
    // и до syncCards дело не дойдёт.
    const { client, calls, tables } = fakeClient({
      notes: [note({ reverse: false })],
      cards: [{ id: 'c1', note_id: 'n1', direction: 'forward', deleted: false }, buried],
    })

    await new SupabaseRepository(client).updateNote('n1', { reverse: true })

    const cardInserts = calls.filter((c) => c.table === 'cards' && c.op === 'insert')
    expect(cardInserts).toHaveLength(0)
    expect(tables.cards).toHaveLength(2)
    expect((tables.cards[1] as CardRow).deleted).toBe(false)
  })

  it('выключение reverse не трогает forward-карточку', async () => {
    // В базе обратная ещё включена - патч её выключает.
    const { client, tables } = fakeClient({
      notes: [note({ reverse: true })],
      cards: [
        { id: 'c1', note_id: 'n1', direction: 'forward', deleted: false },
        { id: 'c2', note_id: 'n1', direction: 'reverse', deleted: false },
      ],
    })

    await new SupabaseRepository(client).updateNote('n1', { reverse: false })

    const cards = tables.cards as CardRow[]
    expect(cards.find((c) => c.direction === 'forward')!.deleted).toBe(false)
    expect(cards.find((c) => c.direction === 'reverse')!.deleted).toBe(true)
  })

  it('undo не удаляет строку журнала: на сервере он append-only', async () => {
    const { client, calls } = fakeClient({
      cards: [{ id: 'c1', deleted: false }],
      review_logs: [{ id: 'l1', card_id: 'c1' }],
    })

    await new SupabaseRepository(client).undoReview({ id: 'c1' } as CardRow, 'l1')

    expect(calls.some((c) => c.table === 'review_logs' && c.op === 'delete')).toBe(false)
  })

  it('внятно жалуется, когда строки настроек нет (не сработал триггер)', async () => {
    const { client } = fakeClient({ settings: [] })
    await expect(new SupabaseRepository(client).getSettings()).rejects.toThrow(
      /on_auth_user_created/,
    )
  })

  it('оживляя карточку, не затирает её created_at и updated_at', async () => {
    // Дату появления карточки сбрасывать нельзя: FSRS-состояние обнуляется
    // намеренно (навык другой), а created_at к состоянию не относится.
    // Временем на сервере вообще владеют дефолт и триггер, не браузер.
    const buried: Partial<CardRow> = {
      id: 'c-reverse',
      note_id: 'n1',
      direction: 'reverse',
      deleted: true,
      created_at: '2020-01-01T00:00:00.000Z',
    }
    const { client, calls } = fakeClient({
      notes: [note({ reverse: false })],
      cards: [{ id: 'c1', note_id: 'n1', direction: 'forward', deleted: false }, buried],
    })

    await new SupabaseRepository(client).updateNote('n1', { reverse: true })

    const revive = calls.find((c) => c.table === 'cards' && c.op === 'update')
    expect(revive!.payload).not.toHaveProperty('created_at')
    expect(revive!.payload).not.toHaveProperty('updated_at')
  })

  it('новые карточки не несут время из браузера - им владеет сервер', async () => {
    const { client, calls } = fakeClient({ notes: [], cards: [] })
    const input = { ...note() }
    delete (input as Partial<NoteRow>).user_id
    delete (input as Partial<NoteRow>).created_at
    delete (input as Partial<NoteRow>).updated_at
    delete (input as Partial<NoteRow>).deleted
    await new SupabaseRepository(client).createNote(input)

    const cardInsert = calls.find((c) => c.table === 'cards' && c.op === 'insert')
    for (const row of cardInsert!.payload as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty('created_at')
      expect(row).not.toHaveProperty('updated_at')
    }
  })

  it('читает журнал постранично: лимит PostgREST в 1000 строк не режет выдачу', async () => {
    // Без пагинации обрезка происходит МОЛЧА, и статистика врёт без ошибки.
    const logs = Array.from({ length: 2500 }, (_, i) => ({ id: `l${i}`, card_id: `c${i}` }))
    const { client } = fakeClient({ review_logs: logs })

    const got = await new SupabaseRepository(client).listReviewLogs()

    expect(got).toHaveLength(2500)
  })

  describe('listNotesPage', () => {
    const pageQuery = {
      folderId: null,
      search: '',
      type: 'all',
      offset: 0,
      limit: 50,
    } as const

    it('возвращает окно offset..offset+limit, а не всё разом', async () => {
      const notes = Array.from({ length: 120 }, (_, i) => note({ id: `n${i}`, front: `w${i}` }))
      const { client } = fakeClient({ notes })
      const repo = new SupabaseRepository(client)

      const first = await repo.listNotesPage({ ...pageQuery, offset: 0, limit: 50 })
      const second = await repo.listNotesPage({ ...pageQuery, offset: 50, limit: 50 })

      expect(first).toHaveLength(50)
      expect(second).toHaveLength(50)
      // Окна не пересекаются - иначе бесконечный скролл дублировал бы строки.
      const ids = new Set(first.map((n) => n.id))
      expect(second.some((n) => ids.has(n.id))).toBe(false)
    })

    it('фильтрует по папке', async () => {
      const { client } = fakeClient({
        notes: [note({ id: 'a', folder_id: 'f1' }), note({ id: 'b', folder_id: 'f2' })],
      })
      const got = await new SupabaseRepository(client).listNotesPage({
        ...pageQuery,
        folderId: 'f1',
      })
      expect(got.map((n) => n.id)).toEqual(['a'])
    })

    it('поиск ищет по front и back без учёта регистра', async () => {
      const { client } = fakeClient({
        notes: [
          note({ id: 'a', front: 'Otter', back: 'выдра' }),
          note({ id: 'b', front: 'fox', back: 'лиса' }),
        ],
      })
      const repo = new SupabaseRepository(client)
      expect((await repo.listNotesPage({ ...pageQuery, search: 'OTT' })).map((n) => n.id)).toEqual([
        'a',
      ])
      expect((await repo.listNotesPage({ ...pageQuery, search: 'лиса' })).map((n) => n.id)).toEqual(
        ['b'],
      )
    })

    it('не отдаёт удалённые', async () => {
      const { client } = fakeClient({
        notes: [note({ id: 'a' }), note({ id: 'b', deleted: true })],
      })
      const got = await new SupabaseRepository(client).listNotesPage(pageQuery)
      expect(got.map((n) => n.id)).toEqual(['a'])
    })
  })

  it('folderNoteCounts даёт счётчики по папкам и «все слова» - через head-count, без чтения строк', async () => {
    const { client, calls } = fakeClient({
      folders: [
        { id: 'f1', deleted: false, position: 0 },
        { id: 'f2', deleted: false, position: 1 },
      ],
      notes: [
        note({ id: 'n1', folder_id: 'f1' }),
        note({ id: 'n2', folder_id: 'f1' }),
        note({ id: 'n3', folder_id: 'f2' }),
        note({ id: 'n4', folder_id: null }),
        note({ id: 'n5', folder_id: 'f1', deleted: true }),
      ],
    })

    const counts = await new SupabaseRepository(client).folderNoteCounts()
    const of = (id: string | null) => counts.find((c) => c.folderId === id)?.count

    expect(of(null)).toBe(4) // все живые, включая без папки, кроме удалённой
    expect(of('f1')).toBe(2)
    expect(of('f2')).toBe(1)
    // Счётчики не читают строки: запросы к notes идут в head-режиме (payload
    // пустой у select), а не тянут тела.
    expect(calls.some((c) => c.table === 'notes' && c.op === 'select')).toBe(true)
  })

  it('listCardsForNotes без id не делает запрос', async () => {
    const { client, calls } = fakeClient({ cards: [{ id: 'c1', note_id: 'n1', deleted: false }] })
    const got = await new SupabaseRepository(client).listCardsForNotes([])
    expect(got).toEqual([])
    expect(calls.some((c) => c.table === 'cards')).toBe(false)
  })

  it('replaceAll удаляет зависимые раньше родителей - иначе внешние ключи не дадут', async () => {
    const { client, calls } = fakeClient({
      folders: [{ id: 'f1' }],
      notes: [{ id: 'n1' }],
      cards: [{ id: 'c1' }],
      review_logs: [{ id: 'l1' }],
      settings: [{ user_id: 'u1', new_cards_per_day: 20 }],
    })

    await new SupabaseRepository(client).replaceAll({
      folders: [],
      notes: [],
      cards: [],
      review_logs: [],
      settings: null,
    })

    const deletes = calls.filter((c) => c.op === 'delete').map((c) => c.table)
    expect(deletes).toEqual(['review_logs', 'cards', 'notes', 'folders'])
  })

  it('replaceAll срезает user_id из бэкапа и не мутирует исходные строки', async () => {
    // Бэкап мог приехать с локальной версии (user_id = 'local-user', не UUID)
    // или с чужого аккаунта. Сервер проставит auth.uid() сам.
    // Мутировать разобранный бэкап при этом нельзя - он принадлежит вызывающему.
    const backupFolder = { id: 'f1', user_id: 'local-user', name: 'Animals' }
    const { client, calls } = fakeClient({
      folders: [],
      notes: [],
      cards: [],
      review_logs: [],
      settings: [{ user_id: 'u1' }],
    })

    await new SupabaseRepository(client).replaceAll({
      folders: [backupFolder as never],
      notes: [],
      cards: [],
      review_logs: [],
      settings: null,
    })

    const insert = calls.find((c) => c.table === 'folders' && c.op === 'insert')
    expect((insert!.payload as Record<string, unknown>[])[0]).not.toHaveProperty('user_id')
    // Исходный объект цел.
    expect(backupFolder.user_id).toBe('local-user')
  })

  it('replaceAll не трогает данные, если строки настроек нет', async () => {
    // getSettings бросает - но ДО удаления, иначе пользователь остался бы
    // с пустой базой и невнятной ошибкой.
    const { client, tables } = fakeClient({
      folders: [{ id: 'f1' }],
      notes: [],
      cards: [],
      review_logs: [],
      settings: [],
    })

    await expect(
      new SupabaseRepository(client).replaceAll({
        folders: [],
        notes: [],
        cards: [],
        review_logs: [],
        settings: { user_id: 'u1' } as never,
      }),
    ).rejects.toThrow(/on_auth_user_created/)

    expect(tables.folders).toHaveLength(1)
  })

  it('ошибку PostgREST превращает в исключение, а не отдаёт пустой список', async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(new SupabaseRepository(failing).listFolders()).rejects.toThrow('permission denied')
  })
})
