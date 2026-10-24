import { useId } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import type { ThemePreference, ThemeStore } from '@/hooks/useTheme'
import { appearanceTitle } from './appearance'

const OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Dia', Icon: Sun },
  { value: 'dark', label: 'Noite', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Monitor },
]

/*
 * Cartão "Luzes do estádio" (Menu do Perfil, seção Aparência; docs/plano-tema.md). O desenho é decorativo e fica em
 * CSS (`.stadium` em ui.css): céu, sol, refletores com o feixe, o Coliseu e o gramado; na Noite o céu escurece e os
 * refletores acendem. As opções Dia, Noite e Automático são botões com `aria-pressed` num grupo "Tema"; a troca vale na
 * hora, sem salvar, e o próprio cartão mostra o resultado (título e opção marcada), sem toast.
 */
export function AppearanceCard({ store }: { store?: ThemeStore }) {
  const { preference, resolved, setPreference } = useTheme(store)
  const titleId = useId()
  return <section data-slot="appearance-card" data-lit={resolved === 'dark' ? '' : undefined} className="stadium" aria-labelledby={titleId}>
    <span aria-hidden="true" className="stadium-sky stadium-sky-day" />
    <span aria-hidden="true" className="stadium-sky stadium-sky-night" />
    <span aria-hidden="true" className="stadium-sun" />
    <span aria-hidden="true" className="stadium-pole stadium-pole-l"><i /></span>
    <span aria-hidden="true" className="stadium-pole stadium-pole-r"><i /></span>
    <span aria-hidden="true" className="stadium-beam stadium-beam-l" />
    <span aria-hidden="true" className="stadium-beam stadium-beam-r" />
    <span aria-hidden="true" className="stadium-coliseum" />
    <span aria-hidden="true" className="stadium-pitch" />
    <div className="stadium-text">
      <span className="stadium-eyebrow">Tema</span>
      <b id={titleId} className="stadium-title">{appearanceTitle(preference, resolved)}</b>
    </div>
    <div role="group" aria-label="Tema" className="stadium-options">
      {OPTIONS.map(({ value, label, Icon }) =>
        <button key={value} type="button" aria-pressed={preference === value} onClick={() => setPreference(value)}>
          <Icon size={13} aria-hidden="true" />{label}
        </button>)}
    </div>
  </section>
}
