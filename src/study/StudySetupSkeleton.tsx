import { Skeleton } from '@/components/Loading'

/**
 * Скелетон экрана выбора области. Повторяет раскладку `StudySetup`: заголовок,
 * сегмент-контрол режима, список папок, кнопка старта внизу.
 *
 * Сегмент режима и кнопка «Начать» - настоящие по форме, но плейсхолдеры:
 * их положение известно заранее и не зависит от данных, поэтому держать их
 * геометрию важнее, чем прятать.
 */
export function StudySetupSkeleton() {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-[560px] flex-col px-5 py-7 lg:py-10"
      role="status"
      aria-label="Загрузка"
    >
      <Skeleton className="h-[26px] w-[190px] rounded-[6px] lg:h-[30px] lg:w-[220px]" />
      <Skeleton className="mt-2.5 h-3.5 w-full max-w-[380px] rounded-[4px]" />

      {/* Сегмент-контрол режима: фон рейла настоящий, вкладки - плейсхолдеры */}
      <div className="mt-6 flex gap-2 rounded-[14px] bg-rail p-1">
        <Skeleton className="h-[38px] flex-1 rounded-[11px]" />
        <Skeleton className="h-[38px] flex-1 rounded-[11px]" />
      </div>

      {/* Список папок */}
      <div className="mt-5 min-h-0 flex-1">
        <Skeleton className="mb-2 ml-1 h-3 w-[62px] rounded-[4px]" />
        <div className="flex flex-col gap-1.5">
          {[64, 78, 52, 70].map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[14px] border border-line bg-card px-4 py-3"
            >
              <Skeleton className="size-5 shrink-0 rounded-md" />
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1 rounded-[4px]" style={{ maxWidth: `${w}%` }} />
              <Skeleton className="h-3 w-[86px] shrink-0 rounded-[4px]" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="mt-5 h-[56px] w-full rounded-[16px]" />
    </div>
  )
}
