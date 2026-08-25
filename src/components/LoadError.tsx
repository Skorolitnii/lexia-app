import { OfflineIcon } from '@/components/icons'
import { useOnline } from '@/components/useOnline'

/**
 * Данные не прочитались. Отдельный экран, а не `Placeholder` с текстом: без
 * сети при серверном хранилище это самый частый тупик, и из него нужен выход
 * (§8.9) - иначе остаётся только перезагружать вкладку.
 *
 * Сообщение зависит от `navigator.onLine`: «нет сети» - это диагноз, который
 * пользователь может исправить сам, а отказ базы при живой сети - нет, и
 * обещать «проверьте соединение» там было бы враньём.
 *
 * Локального режима (IndexedDB) это почти не касается: там чтение не зависит
 * от сети, поэтому сюда попадают только реальные отказы хранилища.
 */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  const online = useOnline()

  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 rounded-card border border-line bg-surface p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-track text-faint-2">
        <OfflineIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-[16px] font-bold text-ink">
          {online ? `Не удалось загрузить ${what}` : 'Нет соединения'}
        </p>
        <p className="max-w-[320px] text-[14px] font-medium text-faint">
          {online
            ? 'Данные не пришли. Попробуйте ещё раз.'
            : 'Ваши слова хранятся на сервере, а он сейчас недоступен. Проверьте сеть и повторите.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded-pill bg-brand px-5 py-2.5 text-[14px] font-bold text-white shadow-brand transition-transform active:scale-95"
      >
        Повторить
      </button>
    </div>
  )
}
