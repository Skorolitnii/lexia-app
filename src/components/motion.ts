import type { Transition, Variants } from 'motion/react'

/**
 * Общие пресеты анимаций. Держим их в одном месте, чтобы движения по всему
 * приложению читались как одна система, а не набор случайных длительностей.
 *
 * `motion` уважает `prefers-reduced-motion` через `<MotionConfig reducedMotion>`
 * (см. `main.tsx`) - отдельных проверок в компонентах не нужно.
 */

/** Мягкая пружина для входа модалок и панелей. */
export const softSpring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 34,
  mass: 0.9,
}

/** Быстрый tween для fade-подложек. */
export const quickFade: Transition = { duration: 0.18, ease: [0.4, 0, 0.2, 1] }

/** Подложка модалки (затемнение). */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: quickFade },
  exit: { opacity: 0, transition: quickFade },
}

/** Окно модалки на десктопе - выезжает снизу с лёгким масштабом. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: softSpring },
  exit: { opacity: 0, y: 12, scale: 0.98, transition: quickFade },
}

/** Лист на мобайле - выезжает снизу на всю высоту. */
export const sheetVariants: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: softSpring },
  exit: { y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
}

/**
 * Контейнер списка со stagger: дети появляются друг за другом.
 * Использовать с `listItem` на детях.
 */
export const listContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
}

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } },
}
