import { Rating, type Grade } from 'ts-fsrs'
import type { RatingOption } from '@/study/useStudySession'

/** Вид кнопки по рейтингу: Good - залитая брендовым, остальные - мягкая заливка. */
const STYLES: Record<Grade, { wrap: string; label: string; sub: string }> = {
  [Rating.Again]: {
    wrap: 'bg-again-soft',
    label: 'text-again',
    sub: 'text-again-sub',
  },
  [Rating.Hard]: {
    wrap: 'bg-hard-soft',
    label: 'text-hard',
    sub: 'text-hard-sub',
  },
  [Rating.Good]: {
    wrap: 'bg-brand shadow-brand',
    label: 'text-white',
    sub: 'text-good-sub',
  },
  [Rating.Easy]: {
    wrap: 'bg-easy-soft',
    label: 'text-easy',
    sub: 'text-easy-sub',
  },
}

/**
 * Подписи по-русски: англоязычные Again/Hard/Good/Easy ничего не говорят тому,
 * кто только начал учить английский, - а это ровно наша аудитория.
 */
const LABELS: Record<Grade, string> = {
  [Rating.Again]: 'Не помню',
  [Rating.Hard]: 'Трудно',
  [Rating.Good]: 'Помню',
  [Rating.Easy]: 'Легко',
}

/**
 * Кнопки оценки. Интервал следующего показа и номер хоткея НЕ показываем:
 * «1м · 1» читалось как одна цифра и требовало объяснять внутреннюю кухню FSRS,
 * а на новой карточке минуты вдобавок ничего не значат. Хоткеи 1-4 продолжают
 * работать (`useStudyHotkeys`), просто не нарисованы.
 */
export function RatingBar({
  options,
  onRate,
}: {
  options: RatingOption[]
  onRate: (rating: Grade) => void
}) {
  return (
    <div className="flex gap-2.5 lg:gap-3">
      {options.map(({ rating }) => {
        const style = STYLES[rating]
        return (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            className={`flex-1 cursor-pointer rounded-[18px] px-1 py-4 text-center lg:rounded-2xl ${style.wrap}`}
          >
            <span
              className={`block text-[14px] font-extrabold text-balance lg:text-[15px] ${style.label}`}
            >
              {LABELS[rating]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
