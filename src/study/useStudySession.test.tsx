// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { RepoContext } from '@/data/RepoContext'
import type { Repository } from '@/data/repo'
import { useStudySession } from '@/study/useStudySession'
import type { CardRow, NoteRow, SettingsRow } from '@/types'

/**
 * Дневная норма новых слов раньше была стеной: очередь кончалась, а кнопка
 * «Учить дальше» пересобирала её с тем же лимитом и ничего не меняла.
 */

const NOW = '2026-08-18T12:00:00.000Z'

function note(id: string): NoteRow {
  return {
    id,
    user_id: 'u',
    folder_id: null,
    type: 'basic',
    front: id,
    back: 'x',
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: false,
    tags: [],
    created_at: NOW,
    updated_at: NOW,
    deleted: false,
  }
}

function newCard(id: string, note_id: string): CardRow {
  return {
    id,
    user_id: 'u',
    note_id,
    direction: 'forward',
    due: NOW,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review: null,
    learning_steps: 0,
    suspended: false,
    created_at: NOW,
    updated_at: NOW,
    deleted: false,
  }
}

/** Репозиторий с `count` новых карточек и дневной нормой `limit`. */
function makeRepo(count: number, limit: number, introduced = 0): Repository {
  const notes = Array.from({ length: count }, (_, i) => note(`n${i}`))
  const cards = notes.map((n, i) => newCard(`c${i}`, n.id))
  return {
    listCards: vi.fn().mockResolvedValue(cards),
    listNotes: vi.fn().mockResolvedValue(notes),
    listFolders: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({ new_cards_per_day: limit } as SettingsRow),
    countNewCardsIntroduced: vi.fn().mockResolvedValue(introduced),
  } as unknown as Repository
}

const wrapper = (repo: Repository) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>
  }

afterEach(cleanup)

describe('useStudySession - дневная норма', () => {
  it('очередь ограничена нормой, остальное лежит в резерве', async () => {
    const { result } = renderHook(() => useStudySession(), {
      wrapper: wrapper(makeRepo(50, 20)),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.counts.total).toBe(20)
    // Экран итога должен знать, что за лимитом ещё 30 слов.
    expect(result.current.outlook.newBeyondLimit).toBe(30)
  })

  it('добор берёт новые сверх нормы', async () => {
    const { result } = renderHook(() => useStudySession(), {
      wrapper: wrapper(makeRepo(50, 20)),
    })
    await waitFor(() => expect(result.current.counts.total).toBe(20))

    act(() => result.current.studyMore(10))

    // Ровно та проблема, ради которой всё затевалось: кнопка обязана дать
    // новые карточки, а не пересобрать ту же очередь.
    await waitFor(() => expect(result.current.counts.total).toBe(30))
    expect(result.current.outlook.newBeyondLimit).toBe(20)
  })

  it('резерв пуст, когда норма покрывает всю папку', async () => {
    const { result } = renderHook(() => useStudySession(), {
      wrapper: wrapper(makeRepo(5, 20)),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.outlook.newBeyondLimit).toBe(0)
  })

  it('исчерпанная за день норма не даёт новых, но резерв виден', async () => {
    // 20 из 20 уже введены сегодня - очередь пуста, хотя слова есть.
    const { result } = renderHook(() => useStudySession(), {
      wrapper: wrapper(makeRepo(50, 20, 20)),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.counts.total).toBe(0)
    expect(result.current.outlook.newBeyondLimit).toBe(50)
  })
})
