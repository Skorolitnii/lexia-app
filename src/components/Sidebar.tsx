import { NavLink } from 'react-router'
import { AccountBadge } from '@/components/AccountBadge'
import { zones } from '@/navigation'

/** Десктопный левый рейл (≥ lg). Соответствует макету «Пустой экран v2». */
export function Sidebar() {
  return (
    <aside className="flex w-[252px] flex-col border-r border-sidebar-line bg-sidebar px-3.5 pt-[22px] pb-[18px]">
      <div className="mb-7 flex items-center gap-[11px] px-2">
        {/* Знак «Стопка»: колода карточек (= favicon.svg) */}
        <svg viewBox="0 0 64 64" className="size-[34px]" aria-hidden="true">
          <g transform="rotate(-8 32 32)">
            <rect
              x="16"
              y="11"
              width="30"
              height="42"
              rx="7"
              strokeWidth={2.5}
              className="fill-card stroke-brand-strong"
            />
          </g>
          <g transform="rotate(7 34 34)">
            <rect x="20" y="13" width="30" height="42" rx="7" className="fill-brand" />
            <rect x="27" y="37" width="12" height="4" rx="2" fill="#fff" opacity=".55" />
            <rect x="27" y="44" width="17" height="4" rx="2" fill="#fff" />
          </g>
        </svg>
        <div className="text-[21px] font-extrabold tracking-[-0.01em] text-ink">Lexia</div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {/* FAB-зоны (Добавить) - мобильное действие, а не пункт бокового меню:
            на десктопе добавляют кнопкой внутри Библиотеки, поэтому пропускаем. */}
        {zones
          .filter(({ fab }) => !fab)
          .map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  // `leading-5` фиксирует высоту строки: без него смена веса
                  // 700→800 у активного пункта меняла line box (43.75 → 44px)
                  // и все пункты ниже подпрыгивали. `transition-[...]` вместо
                  // `transition-colors` - иначе тень активного возникала рывком,
                  // минуя анимацию.
                  'flex items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] leading-5',
                  'transition-[background-color,color,box-shadow] duration-150 ease-out',
                  isActive
                    ? 'bg-brand font-extrabold text-white shadow-nav-active'
                    : 'font-bold text-nav-ink hover:bg-nav-hover',
                ].join(' ')
              }
            >
              {/* Иконка без плашки, в цвет текста строки: на залитом активном
                  пункте она белая, на остальных - тёмная. Толщина обводки
                  одна на оба состояния: `stroke-width` - атрибут, он не
                  анимируется и переключался скачком. */}
              <Icon width={19} height={19} strokeWidth={2.2} className="shrink-0" />
              {label}
            </NavLink>
          ))}
      </nav>

      <div className="mt-auto border-t border-line-soft pt-3.5">
        <AccountBadge />
      </div>
    </aside>
  )
}
