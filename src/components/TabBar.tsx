import { NavLink } from 'react-router'
import { zones } from '@/navigation'

/** Мобильный нижний таб-бар с приподнятой центральной FAB (< lg). */
export function TabBar() {
  return (
    <nav className="pb-safe relative flex h-[88px] items-start border-t border-line-soft bg-card px-[18px] pt-3">
      {zones.map(({ to, label, Icon, fab }) =>
        fab ? (
          <NavLink key={to} to={to} className="flex flex-1 justify-center" aria-label={label}>
            <div className="-mt-[22px] flex size-[58px] items-center justify-center rounded-full bg-brand shadow-fab">
              <Icon width={24} height={24} className="text-white" strokeWidth={2.5} />
            </div>
          </NavLink>
        ) : (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center gap-[5px]',
                isActive ? 'text-brand-ink' : 'text-tab-idle',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon width={22} height={22} />
                <span
                  className={['text-[11px]', isActive ? 'font-bold' : 'font-semibold'].join(' ')}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ),
      )}
    </nav>
  )
}
