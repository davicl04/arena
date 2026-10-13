import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** tailwind-merge ciente dos tokens ARENA de ui.css (raios, sombras, animações e camadas nomeadas). */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['field', 'control', 'card', 'panel', 'sheet', 'app'],
      shadow: ['app', 'primary', 'card', 'soft', 'sheet', 'play'],
      animate: ['glass-in', 'viewer-in', 'ripple'],
    },
    classGroups: {
      z: [{ z: ['photo-glass', 'tabs', 'topbar', 'viewer', 'nav', 'glass-screen', 'skip-link', 'scrim', 'sheet'] }],
    },
  },
})

/** Combina classes condicionais e resolve conflitos de utilitários Tailwind (padrão shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
