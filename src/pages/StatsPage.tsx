import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageShell, Placeholder } from '@/components/PageShell'
import { DESKTOP_QUERY, useMediaQuery } from '@/components/useMediaQuery'
import { OnboardingSheets, type OnboardingSheet } from '@/library/OnboardingSheets'
import { useStats } from '@/stats/useStats'
import {
  ActivityChart,
  MaturityPanel,
  RatingsPanel,
  RetentionCard,
  StatTile,
  StreakHero,
} from '@/stats/StatsCards'
import { StatsSkeleton } from '@/stats/StatsSkeleton'
import { plural } from '@/study/format'

export function StatsPage() {
  const { loading, stats, folders, error, reload } = useStats()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  // Модалка онбординга поверх пустого экрана (слово / импорт).
  const [sheet, setSheet] = useState<OnboardingSheet>(null)

  if (loading) {
    return (
      <PageShell title="Статистика">
        <StatsSkeleton />
      </PageShell>
    )
  }

  // `computeStats` возвращает валидный объект и на пустой базе, поэтому
  // отсутствие stats означает ровно одно: данные не прочитались.
  if (!stats) {
    return (
      <PageShell title="Статистика">
        {error ? (
          // Повтор, а не просто текст: офлайн - самая частая причина, и она
          // проходит сама. Тот же экран, что в Библиотеке и Изучении.
          <LoadError what="статистику" onRetry={reload} />
        ) : (
          <Placeholder>Нет данных</Placeholder>
        )}
      </PageShell>
    )
  }

  // Пустой аккаунт: стена из нулей демотивирует и ничего не подсказывает.
  // Тот же онбординг, что в Библиотеке и Изучении: пока колоды нет, «результаты»
  // этому экрану показывать не из чего, и пользователю нужны ровно те же три
  // пути её собрать. Модалки открываются здесь же - уводить в Библиотеку
  // (`/library?new=1`) значило бы телепортировать в другой раздел за тем, что
  // делается на месте.
  if (stats.totalNotes === 0) {
    return (
      <>
        <EmptyState
          title="Соберите первую колоду"
          description="Достаточно 10 слов, чтобы запустить интервальные повторения."
          onAddWord={() => setSheet('note')}
          onImport={() => setSheet('import')}
          onInstalled={reload}
        />
        <OnboardingSheets
          open={sheet}
          folders={folders}
          onClose={() => setSheet(null)}
          onChanged={reload}
        />
      </>
    )
  }

  const week = stats.addedThisWeek

  return (
    <PageShell title="Статистика">
      <div className="flex flex-col gap-3.5">
        <StreakHero stats={stats} />

        <div className="flex gap-3">
          <StatTile
            label="К повтору"
            value={stats.dueToday}
            hint={stats.dueToday === 0 ? 'всё повторено' : `≈ ${stats.dueMinutes} мин`}
            accent
          />
          <StatTile
            label="Всего слов"
            value={stats.totalNotes}
            hint={week > 0 ? `+${week} за неделю` : 'за неделю без новых'}
          />
          {/* Третья плитка только на десктопе: на мобайле в ряд влезают две. */}
          <div className="hidden flex-1 lg:block">
            <StatTile
              label="Сегодня"
              value={stats.reviewsToday}
              hint={plural(stats.reviewsToday, 'повтор', 'повтора', 'повторов')}
            />
          </div>
        </div>

        {/* Окно активности зависит от ширины: на узком экране 30 столбиков
            превращаются в нечитаемую гребёнку, поэтому мобайлу - две недели.
            Здесь брейкпоинт меняет ДАННЫЕ, а не оформление, поэтому реальный
            медиазапрос, а не пара `lg:hidden`: две копии графика означали бы
            два списка дней в дереве доступности. */}
        <ActivityChart activity={stats.activity} days={isDesktop ? 30 : 14} />

        <div className="flex flex-col gap-3.5 lg:flex-row">
          <MaturityPanel maturity={stats.maturity} />
          <RatingsPanel ratings={stats.ratings} />
        </div>

        <RetentionCard retention={stats.retention} />
      </div>
    </PageShell>
  )
}
