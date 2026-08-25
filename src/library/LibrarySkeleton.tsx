import { Skeleton } from '@/components/Loading'

/**
 * Скелетон библиотеки. Повторяет реальную раскладку `LibraryPage`: колонка папок
 * (десктоп), шапка, строка поиска, строки списка. Размеры и отступы взяты с тех
 * же элементов - иначе при появлении данных экран дёрнется, а ради отсутствия
 * этого дёрганья скелетон и нужен.
 *
 * Строк рисуем по количеству, влезающему в экран: на мобайле их видно меньше,
 * и лишние всё равно оказались бы за краем.
 */
export function LibrarySkeleton() {
  return (
    <div className="flex h-full" role="status" aria-label="Загрузка библиотеки">
      {/* Колонка папок - десктоп (w-[226px] px-4 py-6, как в LibraryPage) */}
      <aside className="hidden w-[226px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <Skeleton className="mb-4 ml-1.5 h-3 w-14 rounded-[4px]" />
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <Skeleton
                className="h-3.5 rounded-[4px]"
                // Разная ширина: колонка одинаковых полосок читается как таблица,
                // а не как список папок с именами разной длины.
                style={{ width: `${[68, 82, 54, 74, 60][i]}%` }}
              />
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 lg:px-7">
        {/* Шапка: заголовок + кнопки действий */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[150px] flex-1 items-center gap-2.5 lg:min-w-0">
            <Skeleton className="hidden size-2.5 shrink-0 rounded-full lg:block" />
            <Skeleton className="h-[26px] w-[160px] rounded-[6px] lg:h-5 lg:w-[130px]" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="hidden h-[34px] w-[92px] rounded-[11px] lg:block" />
            <Skeleton className="h-[34px] w-[110px] rounded-[11px]" />
            <Skeleton className="h-[34px] w-[96px] rounded-[11px]" />
          </div>
        </div>

        {/* Поиск + фильтр типа */}
        <div className="mb-4 flex flex-col gap-2 lg:flex-row">
          <Skeleton className="h-[42px] flex-1 rounded-[12px]" />
          <Skeleton className="h-[42px] rounded-[12px] lg:w-[140px]" />
        </div>

        {/* Папки - мобайл */}
        <div className="mb-5 lg:hidden">
          <Skeleton className="mb-3 ml-1.5 h-3 w-14 rounded-[4px]" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <Skeleton className="size-2.5 shrink-0 rounded-full" />
                <Skeleton
                  className="h-3.5 rounded-[4px]"
                  style={{ width: `${[70, 48, 62][i]}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <NoteRowsSkeleton />
      </div>
    </div>
  )
}

/**
 * Строки списка заметок. Вынесены отдельно: тот же скелетон нужен при смене
 * папки/фильтра, когда шапка и колонка папок уже отрисованы и меняется
 * только список.
 */
export function NoteRowsSkeleton({
  rows = 8,
  /** Шапка таблицы нужна только в начале списка; при догрузке она уже есть. */
  header = true,
}: {
  rows?: number
  header?: boolean
}) {
  return (
    <>
      {/* Шапка таблицы - только десктоп, как в NoteList */}
      {header && (
        <div className="hidden items-center gap-4 border-b border-line px-3.5 pb-2.5 lg:flex">
          <Skeleton className="h-2.5 w-[52px] rounded-[3px]" />
          <Skeleton className="h-2.5 w-[64px] flex-none rounded-[3px]" />
        </div>
      )}

      <div className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line-faint px-1.5 py-3 lg:gap-4 lg:px-3.5"
          >
            <div className="min-w-0 flex-1 lg:w-[190px] lg:flex-none">
              <Skeleton
                className="h-4 rounded-[4px]"
                style={{ width: `${[62, 78, 54, 70, 84, 58, 74, 66][i % 8]}%` }}
              />
              <Skeleton className="mt-1.5 h-3 w-[45%] rounded-[4px] lg:hidden" />
            </div>
            <Skeleton className="hidden h-3.5 flex-1 rounded-[4px] lg:block" />
            <Skeleton className="hidden h-5 w-[62px] rounded-pill lg:block" />
            <Skeleton className="h-3 w-[34px] shrink-0 rounded-[4px] lg:w-[46px]" />
          </div>
        ))}
      </div>
    </>
  )
}
