import type { ReactNode } from 'react'
import { Skeleton } from '@/components/Loading'

/**
 * Скелетон статистики: герой-блок серии, плитки, график активности, панели.
 * Геометрия снята с `StatsCards` (радиусы, отступы, высота графика), чтобы
 * готовые данные встали на то же место без скачка.
 *
 * Столбики графика рисуем детерминированной «пилой», а не случайными высотами:
 * `Math.random()` дал бы новую картинку на каждый ре-рендер, и скелетон
 * дёргался бы во время загрузки.
 */

/** Высоты столбиков активности в процентах - повторяющийся неровный узор. */
const BAR_HEIGHTS = [38, 62, 45, 78, 30, 55, 70, 42, 66, 34, 58, 74, 48, 60]

export function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-label="Загрузка статистики">
      {/* Герой серии: залитый блок, поэтому плейсхолдеры внутри - белые с
          прозрачностью, а не песочные (на зелёном их не было бы видно). */}
      <div className="streak-hero relative overflow-hidden rounded-[22px] p-[22px] opacity-55 shadow-streak">
        <div className="absolute -top-5 -right-5 h-[120px] w-[120px] rounded-full bg-white/12" />
        <div className="relative">
          <div className="h-3 w-[46px] rounded-[4px] bg-white/35" />
          <div className="mt-2 h-[52px] w-[120px] rounded-[8px] bg-white/35 lg:h-[46px]" />
          <div className="mt-2.5 h-3 w-[150px] rounded-[4px] bg-white/25" />
        </div>
      </div>

      {/* Плитки: третья только на десктопе */}
      <div className="flex gap-3">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <div className="hidden flex-1 lg:block">
          <StatTileSkeleton />
        </div>
      </div>

      {/* График активности */}
      <PanelSkeleton>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-[140px] rounded-[4px]" />
          <div className="flex gap-3.5">
            <Skeleton className="h-3 w-[62px] rounded-[4px]" />
            <Skeleton className="h-3 w-[52px] rounded-[4px]" />
          </div>
        </div>
        <div className="flex h-[90px] items-end gap-[3px] lg:gap-[5px]">
          {BAR_HEIGHTS.map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-[3px]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </PanelSkeleton>

      {/* Зрелость + рейтинги */}
      <div className="flex flex-col gap-3.5 lg:flex-row">
        <PanelSkeleton className="flex-[1.3]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-[130px] rounded-[4px]" />
            <Skeleton className="h-3 w-[80px] rounded-[4px]" />
          </div>
          <Skeleton className="h-3.5 w-full rounded-[7px]" />
          <div className="mt-3.5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-[84px] rounded-[4px]" />
                <Skeleton className="h-3 w-[34px] rounded-[4px]" />
              </div>
            ))}
          </div>
        </PanelSkeleton>

        <PanelSkeleton className="flex-1">
          <Skeleton className="mb-4 h-3.5 w-[110px] rounded-[4px]" />
          <div className="flex flex-col gap-2.5">
            {[72, 48, 60, 36].map((w, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-3 w-[52px] shrink-0 rounded-[4px]" />
                <Skeleton className="h-2.5 rounded-pill" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </PanelSkeleton>
      </div>

      {/* Ретеншн */}
      <div className="rounded-[15px] bg-card p-[15px] text-center shadow-card">
        <Skeleton className="mx-auto h-3 w-[120px] rounded-[4px]" />
        <Skeleton className="mx-auto mt-2 h-[34px] w-[86px] rounded-[6px]" />
        <Skeleton className="mx-auto mt-1.5 h-3 w-[96px] rounded-[4px]" />
      </div>
    </div>
  )
}

function StatTileSkeleton() {
  return (
    <div className="flex-1 rounded-[18px] bg-card px-[18px] py-4 shadow-card">
      <Skeleton className="h-3 w-[70px] rounded-[4px]" />
      <Skeleton className="mt-2 h-[30px] w-[58px] rounded-[6px] lg:h-[34px]" />
      <Skeleton className="mt-2 h-3 w-[84px] rounded-[4px]" />
    </div>
  )
}

/** Та же обёртка, что `Panel` в `StatsCards` (радиус 20, фон карточки, тень). */
function PanelSkeleton({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-card p-[18px] shadow-card ${className}`}>{children}</div>
  )
}
