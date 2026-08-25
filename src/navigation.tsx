import type { ComponentType, SVGProps } from 'react'
import {
  StudyIcon,
  LibraryIcon,
  AddIcon,
  StatsIcon,
  SettingsIcon,
} from '@/components/icons'

export interface NavZone {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Показывать как акцентный пункт в мобильном таб-баре. */
  mobileAccent?: boolean
}

/** Зоны десктопного сайдбара. Порядок = порядок в навигации. */
export const zones: NavZone[] = [
  { to: '/study', label: 'Изучение', Icon: StudyIcon },
  { to: '/library', label: 'Библиотека', Icon: LibraryIcon },
  { to: '/add', label: 'Добавить', Icon: AddIcon },
  { to: '/stats', label: 'Статистика', Icon: StatsIcon },
  { to: '/settings', label: 'Настройки', Icon: SettingsIcon },
]

/** Мобильная навигация: только основные разделы, действие добавления живёт в UI. */
export const mobileZones: NavZone[] = [
  { to: '/library', label: 'Библиотека', Icon: LibraryIcon },
  { to: '/study', label: 'Учиться', Icon: StudyIcon, mobileAccent: true },
  { to: '/stats', label: 'Статистика', Icon: StatsIcon },
]

export const sidebarZones: NavZone[] = zones.filter(({ to }) => to !== '/add')
