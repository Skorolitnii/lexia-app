import { Link } from 'react-router'
import { SettingsIcon } from '@/components/icons'

export function MobileSettingsButton() {
  return (
    <Link
      to="/settings"
      aria-label="Настройки"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-faint-2 shadow-pill lg:hidden"
    >
      <SettingsIcon className="size-4" strokeWidth={2.2} />
    </Link>
  )
}
