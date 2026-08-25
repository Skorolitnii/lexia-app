import { Rating, type Grade } from 'ts-fsrs'

/**
 * Кнопки тренировки (cram). Тренировка не пишет в базу и не двигает расписание
 * (`useStudySession`: `if (!cram)`), поэтому четыре оценки FSRS здесь были
 * имитацией - нажатие «Легко» ничем не отличалось от «Трудно». Показываем ровно
 * то, что реально происходит с очередью:
 * - «Ещё раз» (= Rating.Again) возвращает карточку в конец очереди;
 * - «Дальше» (= Rating.Good) убирает её из очереди.
 * Рейтинги передаём те же, чтобы очередь и Undo работали без отдельной ветки.
 */
export function CramBar({ onRate }: { onRate: (rating: Grade) => void }) {
  return (
    <div className="flex gap-2.5 lg:gap-3">
      <button
        type="button"
        onClick={() => onRate(Rating.Again)}
        className="flex-1 cursor-pointer rounded-[18px] bg-again-soft px-1 py-4 text-center text-[14px] font-extrabold text-again lg:rounded-2xl lg:text-[15px]"
      >
        Ещё раз
      </button>
      <button
        type="button"
        onClick={() => onRate(Rating.Good)}
        className="flex-1 cursor-pointer rounded-[18px] bg-brand px-1 py-4 text-center text-[14px] font-extrabold text-white shadow-brand lg:rounded-2xl lg:text-[15px]"
      >
        Дальше
      </button>
    </div>
  )
}
