import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupWord, WordNotFound } from '@/dictionary/api'

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response> | Response) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('lookupWord', () => {
  it('разбирает успешный ответ', async () => {
    mockFetch(() =>
      json([{ word: 'otter', tags: ['n', 'ipa_pron:ˈɑtɝ'], defs: ['n\tAn animal.'] }]),
    )
    const result = await lookupWord('otter')
    expect(result.transcription).toBe('/ˈɑtɝ/')
    // Живой голос приходит не отсюда, а из OneLook.
    expect(result.audioUrl).toBeNull()
    expect(result.definition).toBe('An animal.')
  })

  it('пустой массив - это WordNotFound: 404 у Datamuse не бывает', async () => {
    mockFetch(() => json([]))
    await expect(lookupWord('zzzznotaword')).rejects.toBeInstanceOf(WordNotFound)
  })

  it('сетевой сбой пробрасывается как обычная ошибка (офлайн)', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await lookupWord('otter').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(WordNotFound)
  })

  it('5xx - ошибка, а не «слово не найдено»', async () => {
    mockFetch(() => json({}, 503))
    const error = await lookupWord('otter').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(WordNotFound)
  })

  it('неожиданный не-массив не роняет разбор', async () => {
    mockFetch(() => json({ message: 'unexpected' }))
    await expect(lookupWord('otter')).rejects.toBeInstanceOf(WordNotFound)
  })

  it('слово экранируется в URL и обрезается', async () => {
    const spy = vi.fn((url: string) => json([{ word: url }]))
    mockFetch(spy)
    await lookupWord('  well-known  ')
    const params = new URL(spy.mock.calls[0]![0]).searchParams
    expect(params.get('sp')).toBe('well-known')
    // IPA приходит только с этим флагом - без него был бы ARPAbet.
    expect(params.get('ipa')).toBe('1')
  })
})
