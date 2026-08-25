// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDictionary } from '@/dictionary/useDictionary'

const wrapper = () => {
  // retry:false - иначе тест ждёт backoff между попытками.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// cleanup вручную - авто-очистка Testing Library требует `globals: true`.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDictionary', () => {
  it('не ходит в сеть для фраз и cloze', async () => {
    const spy = vi.fn(() => json([{}]))
    vi.stubGlobal('fetch', spy)

    renderHook(() => useDictionary('The fox is a {{cunning}} animal.', true), {
      wrapper: wrapper(),
    })
    await new Promise((r) => setTimeout(r, 700))
    expect(spy).not.toHaveBeenCalled()
  })

  it('не ходит в сеть, когда лукап выключен (тип cloze)', async () => {
    const spy = vi.fn(() => json([{}]))
    vi.stubGlobal('fetch', spy)

    renderHook(() => useDictionary('otter', false), { wrapper: wrapper() })
    await new Promise((r) => setTimeout(r, 700))
    expect(spy).not.toHaveBeenCalled()
  })

  it('после debounce отдаёт разобранные данные и resolved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json([{ word: 'otter', tags: ['ipa_pron:ˈɑtɝ'] }])),
    )

    const { result } = renderHook(() => useDictionary('otter', true), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.resolved).toBe(true), {
      timeout: 3000,
    })
    expect(result.current.data?.transcription).toBe('/ˈɑtɝ/')
    expect(result.current.failed).toBe(false)
  })

  it('пустой ответ → notFound и resolved (можно затирать транскрипцию)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json([])),
    )

    const { result } = renderHook(() => useDictionary('zzzznotaword', true), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.notFound).toBe(true), {
      timeout: 3000,
    })
    expect(result.current.resolved).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('офлайн → failed, но НЕ resolved: чужие данные затирать нельзя', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )

    const { result } = renderHook(() => useDictionary('otter', true), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.failed).toBe(true), {
      timeout: 3000,
    })
    // Ключевой инвариант: при сетевой ошибке форма сохраняет уже подставленные
    // транскрипцию и аудио, поэтому resolved обязан остаться false.
    expect(result.current.resolved).toBe(false)
    expect(result.current.loading).toBe(false)
  })
})
