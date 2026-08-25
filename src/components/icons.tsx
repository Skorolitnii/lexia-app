/**
 * Иконки навигации и UI. Стиль из макетов «Тёплый»:
 * тонкая обводка 2px, скругления, currentColor.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Изучение - стопка карточек */
export function StudyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="3" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  )
}

/** Библиотека - список */
export function LibraryIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

/** Добавить - плюс */
export function AddIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** Статистика - бары */
export function StatsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 19v-6M12 19V5M18 19v-9" />
    </svg>
  )
}

/** Настройки - точка в круге (как в макете) */
export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Крестик - закрыть */
export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** Озвучка - треугольник Play (залитый, как в макете) */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M9 6.5v11a1 1 0 0 0 1.54.84l8.2-5.5a1 1 0 0 0 0-1.68l-8.2-5.5A1 1 0 0 0 9 6.5Z" />
    </svg>
  )
}

/** Undo - стрелка возврата */
export function UndoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  )
}

/** Повторение - две стрелки по кругу */
export function RepeatIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11V9a3 3 0 0 1 3-3h14" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
    </svg>
  )
}

/** Info - «i» в круге (панель details) */
export function InfoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Галочка - итог сессии */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  )
}

/** Корзина - удаление */
export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11.5v5M14 11.5v5" />
    </svg>
  )
}

/** Карандаш - редактирование */
export function EditIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z" />
      <path d="m13.5 6.5 3 3" />
    </svg>
  )
}

/** Импорт - стрелка вниз в лоток */
export function ImportIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

/** Вставка из буфера - планшет-клипборд */
export function PasteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="3" width="8" height="4" rx="1.5" />
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

/** Поиск */
export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

/** Нет связи - облако, перечёркнутое косой чертой */
export function OfflineIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17.5 18H7a4 4 0 0 1-.8-7.9A5 5 0 0 1 15 8.3a5.5 5.5 0 0 1 2.5 9.7" />
      <path d="m3 3 18 18" />
    </svg>
  )
}
