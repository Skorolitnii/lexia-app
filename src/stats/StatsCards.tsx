import { Rating } from 'ts-fsrs'
import type { DayActivity, Maturity, RatingShare, Stats } from '@/stats/compute'
import { plural } from '@/study/format'

/** Белая карточка-панель - общая основа всех блоков статистики. */
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-card p-[18px] shadow-card ${className}`}>{children}</div>
  )
}

function PanelHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <span className="text-[14px] font-bold text-ink">{title}</span>
      {aside && <span className="text-[12px] font-semibold text-faint-2">{aside}</span>}
    </div>
  )
}

/** Герой-блок серии: крупное число дней + неделя последних занятий точками. */
export function StreakHero({ stats }: { stats: Stats }) {
  return (
    <div className="streak-hero relative overflow-hidden rounded-[22px] p-[22px] text-white shadow-streak">
      <div className="absolute -top-5 -right-5 h-[120px] w-[120px] rounded-full bg-white/12" />
      <div className="relative">
        <div className="text-[13px] font-bold opacity-90">Серия</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-[52px] leading-none font-extrabold lg:text-[46px]">
            {stats.streak}
          </div>
          <div className="text-[18px] font-bold opacity-90">
            {plural(stats.streak, 'день', 'дня', 'дней')}
          </div>
        </div>
        <div className="mt-1.5 text-[13px] opacity-90">
          Рекорд {stats.bestStreak}
          {stats.studiedToday ? ' · сегодня уже занимались' : ' · сегодня ещё не занимались'}
        </div>
        <WeekDots activity={stats.activity} />
      </div>
    </div>
  )
}

/** Последние 7 дней полосками: залитая - были повторы. */
function WeekDots({ activity }: { activity: DayActivity[] }) {
  const week = activity.slice(-7)
  return (
    <div className="mt-3.5 flex gap-[5px]">
      {week.map((day) => {
        const studied = day.reviews + day.newCards > 0
        return (
          <div
            key={day.date}
            className={`h-1.5 flex-1 rounded-[3px] ${studied ? 'bg-white/85' : 'bg-white/40'}`}
          />
        )
      })}
    </div>
  )
}

/** Компактная плитка с числом: «К повтору 9 / ≈ 6 мин». */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string | number
  hint: string
  accent?: boolean
}) {
  return (
    <div className="flex-1 rounded-[18px] bg-card px-[18px] py-4 shadow-card">
      <div className="text-[13px] font-semibold text-faint-2">{label}</div>
      <div className="mt-[3px] text-[30px] leading-tight font-extrabold text-ink lg:text-[34px]">
        {value}
      </div>
      <div className={`mt-0.5 text-[12px] font-bold ${accent ? 'text-brand-ink' : 'text-hint'}`}>
        {hint}
      </div>
    </div>
  )
}

/**
 * Столбики активности: новые сверху, повторы снизу - как в макете.
 * Высота считается от максимума за период, иначе тихий месяц выглядел бы
 * пустым, а бурный упирался бы в потолок.
 */
export function ActivityChart({ activity, days }: { activity: DayActivity[]; days: number }) {
  const shown = activity.slice(-days)
  const max = Math.max(1, ...shown.map((d) => d.reviews + d.newCards))
  const lastIndex = shown.length - 1

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[14px] font-bold text-ink">Активность · {days} дней</span>
        <div className="flex gap-3.5">
          <Legend color="bg-brand" text="повторы" />
          <Legend color="bg-scale-1" text="новые" />
        </div>
      </div>
      <div className="flex h-[90px] items-end gap-[3px] lg:gap-[5px]" role="list">
        {shown.map((day, i) => {
          const total = day.reviews + day.newCards
          // `title` - подсказка мышью, `aria-label` - для скринридера и тача,
          // где нативного тултипа нет вовсе.
          const caption = `${day.date}: ${day.reviews} ${plural(day.reviews, 'повтор', 'повтора', 'повторов')}, ${day.newCards} ${plural(day.newCards, 'новая', 'новые', 'новых')}`
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col justify-end gap-[2px]"
              role="listitem"
              title={caption}
              aria-label={caption}
            >
              {day.newCards > 0 && (
                <div
                  className="rounded-t-[4px] bg-scale-1"
                  style={{ height: `${(day.newCards / max) * 100}%` }}
                />
              )}
              {day.reviews > 0 && (
                <div
                  className={`${day.newCards > 0 ? 'rounded-b-[2px]' : 'rounded-t-[4px] rounded-b-[2px]'} ${
                    i === lastIndex ? 'bg-brand-strong' : 'bg-brand'
                  }`}
                  style={{ height: `${(day.reviews / max) * 100}%` }}
                />
              )}
              {/* Пустой день всё равно занимает колонку: пропуски видны глазом. */}
              {total === 0 && <div className="h-[3px] rounded-[2px] bg-line-faint" />}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-faint-2">
      <span className={`h-2 w-2 rounded-[2px] ${color}`} />
      {text}
    </span>
  )
}

const MATURITY_PARTS = [
  { key: 'new' as const, label: 'Новые', color: 'bg-scale-1' },
  { key: 'learning' as const, label: 'Учу', color: 'bg-scale-3' },
  { key: 'mature' as const, label: 'Зрелые', color: 'bg-scale-5' },
]

/** Зрелость колоды: одна полоса на три сегмента + подписи. */
export function MaturityPanel({ maturity }: { maturity: Maturity }) {
  const { total } = maturity
  return (
    <Panel className="flex-[1.3]">
      <PanelHead
        title="Зрелость колоды"
        aside={`${total} ${plural(total, 'карточка', 'карточки', 'карточек')}`}
      />
      {total === 0 ? (
        <div className="text-[13px] text-faint">Пока нет карточек</div>
      ) : (
        <>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]">
            {MATURITY_PARTS.map(({ key, color }) => {
              const value = maturity[key]
              if (value === 0) return null
              return (
                <div key={key} className={color} style={{ width: `${(value / total) * 100}%` }} />
              )
            })}
          </div>
          <div className="mt-3 flex justify-between gap-2">
            {MATURITY_PARTS.map(({ key, label, color }) => (
              <div key={key}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-[9px] w-[9px] rounded-full ${color}`} />
                  <span className="text-[12.5px] font-semibold text-muted-2">{label}</span>
                </div>
                <div className="mt-[3px] text-[19px] font-extrabold text-ink">{maturity[key]}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

const RATING_STYLE: Record<number, { label: string; bar: string }> = {
  [Rating.Again]: { label: 'Again', bar: 'bg-again-bar' },
  [Rating.Hard]: { label: 'Hard', bar: 'bg-hard-bar' },
  [Rating.Good]: { label: 'Good', bar: 'bg-brand' },
  [Rating.Easy]: { label: 'Easy', bar: 'bg-easy-bar' },
}

/** Распределение оценок за неделю горизонтальными барами. */
export function RatingsPanel({ ratings }: { ratings: RatingShare[] }) {
  const total = ratings.reduce((sum, r) => sum + r.count, 0)
  return (
    <Panel className="flex-1">
      <PanelHead title="Оценки за неделю" />
      {total === 0 ? (
        <div className="text-[13px] text-faint">На этой неделе ещё не было ответов</div>
      ) : (
        <div className="flex flex-col gap-[11px]">
          {ratings.map((share) => {
            const style = RATING_STYLE[share.rating]!
            return (
              <div key={share.rating} className="flex items-center gap-2.5">
                <span className="w-[42px] text-[12.5px] font-bold text-muted-2">{style.label}</span>
                <div className="h-[9px] flex-1 rounded-[5px] bg-line-faint">
                  <div
                    className={`h-full rounded-[5px] ${style.bar}`}
                    style={{ width: `${share.percent}%` }}
                  />
                </div>
                <span className="w-[34px] text-right text-[12px] font-bold text-faint-2">
                  {share.percent}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** Ретеншн - в сайдбаре на десктопе, отдельной плиткой на мобайле. */
export function RetentionCard({ retention }: { retention: number | null }) {
  return (
    <div className="rounded-[15px] bg-card p-[15px] text-center shadow-card">
      <div className="text-[12px] font-semibold text-faint-2">Ретеншн (90 дней)</div>
      <div className="mt-1 text-[34px] font-extrabold text-brand-ink">
        {retention === null ? '-' : `${retention}%`}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold text-hint">
        {retention === null ? 'нужны повторы' : 'верных ответов'}
      </div>
    </div>
  )
}
