// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { RepoContext } from '@/data/RepoContext'
import type { Repository } from '@/data/repo'
import { useLibrary } from '@/library/useLibrary'
import type { NoteRow } from '@/types'

/**
 * Поведение библиотеки при ОТКАЗЕ чтения (§8.9): офлайн при серверном
 * хранилище раньше оставлял вечный скелетон и unhandled rejection - промисы
 * шли без `catch`. Проверяем контракт наружу: `loading` гаснет, поднимается
 * `error`, а повтор возвращает экран к данным.
 */

function note(id: string, front: string): NoteRow {
  return {
    id,
    user_id: 'u',
    folder_id: null,
    type: 'basic',
    front,
    back: null,
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: false,
    tags: [],
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    deleted: false,
  }
}

/** Минимальный репозиторий: только методы, которые читает `useLibrary`. */
function makeRepo(over: Partial<Repository> = {}): Repository {
  return {
    listFolders: vi.fn().mockResolvedValue([]),
    folderNoteCounts: vi.fn().mockResolvedValue([{ folderId: null, count: 1 }]),
    listNotesPage: vi.fn().mockResolvedValue([note('n1', 'otter')]),
    listCardsForNotes: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as Repository
}

function wrapper(repo: Repository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <RepoContext value={repo}>{children}</RepoContext>
  }
}

// Нет `globals: true` - без явного cleanup хуки прошлого теста живут дальше.
afterEach(cleanup)

describe('useLibrary при отказе чтения', () => {
  it('падение страницы гасит загрузку и поднимает error', async () => {
    const repo = makeRepo({ listNotesPage: vi.fn().mockRejectedValue(new Error('offline')) })
    const { result } = renderHook(() => useLibrary(null, '', 'all'), { wrapper: wrapper(repo) })

    await waitFor(() => expect(result.current.error).toBe(true))
    // Ключевое: скелетон не остаётся навсегда.
    expect(result.current.loading).toBe(false)
    // Сентинел бесконечного скролла обязан замолчать, иначе `loadMore`
    // крутился бы в цикле по мёртвой сети.
    expect(result.current.hasMore).toBe(false)
  })

  it('падение папок тоже гасит загрузку: без этого meta === null держал бы скелетон', async () => {
    const repo = makeRepo({ listFolders: vi.fn().mockRejectedValue(new Error('offline')) })
    const { result } = renderHook(() => useLibrary(null, '', 'all'), { wrapper: wrapper(repo) })

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.loading).toBe(false)
  })

  it('успех после отказа снимает ошибку (кнопка «Повторить»)', async () => {
    const listNotesPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([note('n1', 'otter')])
    const repo = makeRepo({ listNotesPage })
    const { result } = renderHook(() => useLibrary(null, '', 'all'), { wrapper: wrapper(repo) })

    await waitFor(() => expect(result.current.error).toBe(true))
    result.current.reload()

    await waitFor(() => expect(result.current.error).toBe(false))
    expect(result.current.notes.map((n) => n.note.front)).toEqual(['otter'])
  })

  it('на живом хранилище ошибки нет, слова приходят', async () => {
    const repo = makeRepo()
    const { result } = renderHook(() => useLibrary(null, '', 'all'), { wrapper: wrapper(repo) })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(result.current.notes).toHaveLength(1)
  })
})
