import { NavLink } from 'react-router'
import { mobileZones } from '@/navigation'

/** Мобильный нижний таб-бар: обучение - центральный акцент, без FAB добавления. */
export function TabBar() {
  return (
    <nav className="pb-safe relative flex h-[82px] items-start border-t border-line-soft bg-card px-[18px] pt-2.5">
      {mobileZones.map(({ to, label, Icon, mobileAccent }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'flex flex-1 flex-col items-center',
              mobileAccent ? 'gap-1' : 'gap-[5px] pt-1.5',
              isActive ? 'text-brand-ink' : 'text-tab-idle',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={
                  mobileAccent
                    ? [
                        'flex size-[42px] items-center justify-center rounded-full transition-colors',
                        isActive
                          ? 'bg-brand text-white shadow-fab'
                          : 'bg-brand-soft text-brand',
                      ].join(' ')
                    : ''
                }
              >
                <Icon
                  width={mobileAccent ? 21 : 22}
                  height={mobileAccent ? 21 : 22}
                  strokeWidth={mobileAccent ? 2.5 : 2}
                />
              </span>
              <span
                className={[
                  'text-[11px]',
                  isActive ? 'font-bold' : 'font-semibold',
                ].join(' ')}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
