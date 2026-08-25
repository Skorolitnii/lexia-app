import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

/** Тон тоста: успех (зелёный) или ошибка (красный). */
export type ToastTone = 'success' | 'error'

interface Toast {
  id: number
  text: string
  tone: ToastTone
}

interface ToastApi {
  /** Показать тост; сам исчезнет через несколько секунд. */
  show: (text: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Сколько тост висит до автоскрытия. */
const TIMEOUT_MS = 3500

/**
 * Глобальные тосты: короткие уведомления внизу экрана (успех/ошибка).
 * Провайдер оборачивает приложение, `useToast().show(...)` вызывается откуда угодно.
 * Рендерятся через портал в `body`, поэтому не зависят от оверлеев и модалок.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Монотонный id: индекс не годится (после удаления сместился бы у соседей).
  const nextId = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (text: string, tone: ToastTone = 'success') => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, text, tone }])
      setTimeout(() => remove(id), TIMEOUT_MS)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4"
          role="status"
          aria-live="polite"
        >
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                onClick={() => remove(t.id)}
                className={`pointer-events-auto max-w-[420px] cursor-pointer rounded-[14px] px-4 py-3 text-center text-[14px] font-bold text-white shadow-summary ${
                  t.tone === 'error' ? 'bg-again' : 'bg-brand-strong'
                }`}
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast должен использоваться внутри ToastProvider')
  return api
}
