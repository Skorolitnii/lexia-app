import { TYPE_BADGE } from '@/components/formStyles'

/**
 * Бейдж типа заметки: слово / слово с обратной карточкой / пропуск. Цвет несёт
 * смысл - одинаковая заливка для всех типов делает колонку бесполезной.
 *
 * Общий для библиотеки и превью импорта: списки стоят рядом в одном сценарии
 * («что уже есть» и «что добавится»), и разъехавшиеся цвета читались бы как
 * разные сущности.
 */
export function TypeBadge({ type, reverse }: { type: 'basic' | 'cloze'; reverse?: boolean }) {
  const isCloze = type === 'cloze'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold ${
        isCloze
          ? 'bg-easy-soft text-easy'
          : reverse
            ? 'bg-brand-soft text-brand-ink'
            : 'bg-track text-muted'
      }`}
      // Стрелки ⇄ = есть обратная карточка; поясняем, иначе символ непонятен.
      title={
        isCloze
          ? 'Предложение с пропуском'
          : reverse
            ? 'Слово · есть обратная карточка (RU → EN)'
            : 'Слово'
      }
    >
      {isCloze ? TYPE_BADGE.cloze : reverse ? `${TYPE_BADGE.basic} ⇄` : TYPE_BADGE.basic}
    </span>
  )
}
