import type { ReactNode } from 'react'
import { MobileSettingsButton } from '@/components/MobileSettingsButton'

/**
 * Обёртка контентной зоны. Ограничивает ширину на десктопе,
 * задаёт отступы и заголовок. Мобайл - на всю ширину.
 */
export function PageShell({
  title,
  children,
  settingsAction = true,
}: {
  title: string
  children?: ReactNode
  settingsAction?: boolean
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[880px] flex-col px-5 pt-6 pb-8 lg:px-8 lg:pt-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[26px] font-extrabold text-ink lg:text-[22px]">
          {title}
        </h1>
        {settingsAction && <MobileSettingsButton />}
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </div>
  )
}

/** Плейсхолдер пустой зоны - «тёплая» карточка-заглушка. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center rounded-card border border-line bg-surface p-8 text-center text-[15px] font-medium text-faint">
      {children}
    </div>
  )
}
