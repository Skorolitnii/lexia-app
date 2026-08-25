// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useMediaQuery } from '@/components/useMediaQuery'

afterEach(cleanup)

/** Управляемый матч-медиа: jsdom своего не даёт. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  let matches = initial

  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }))

  return {
    set(next: boolean) {
      matches = next
      act(() => listeners.forEach((cb) => cb()))
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

function Probe() {
  return <span>{useMediaQuery('(min-width: 1024px)') ? 'desktop' : 'mobile'}</span>
}

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Без useSyncExternalStore первый кадр отрисовался бы мобильным и мигнул.
  it('отдаёт верное значение сразу на первом кадре', () => {
    stubMatchMedia(true)
    render(<Probe />)
    expect(screen.getByText('desktop')).toBeTruthy()
  })

  it('реагирует на смену брейкпоинта', () => {
    const mql = stubMatchMedia(false)
    render(<Probe />)
    expect(screen.getByText('mobile')).toBeTruthy()

    mql.set(true)
    expect(screen.getByText('desktop')).toBeTruthy()
  })

  it('отписывается при размонтировании', () => {
    const mql = stubMatchMedia(false)
    const { unmount } = render(<Probe />)
    expect(mql.listenerCount).toBe(1)

    unmount()
    expect(mql.listenerCount).toBe(0)
  })
})
