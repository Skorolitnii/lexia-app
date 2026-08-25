import type { ComponentType, SVGProps } from 'react'
import { StudyIcon, LibraryIcon, AddIcon, StatsIcon, SettingsIcon } from '@/components/icons'

export interface NavZone {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Показывать как центральную FAB в мобильном таб-баре */
  fab?: boolean
}

/** Пять зон приложения. Порядок = порядок в навигации. */
export const zones: NavZone[] = [
  { to: '/study', label: 'Изучение', Icon: StudyIcon },
  { to: '/library', label: 'Библиотека', Icon: LibraryIcon },
  { to: '/add', label: 'Добавить', Icon: AddIcon, fab: true },
  { to: '/stats', label: 'Статистика', Icon: StatsIcon },
  { to: '/settings', label: 'Настройки', Icon: SettingsIcon },
]
