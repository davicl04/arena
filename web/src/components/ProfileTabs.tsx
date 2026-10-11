import { CalendarDays, Grid3x3 } from 'lucide-react'

const profileTabs = ['Fotos', 'Partidas'] as const
export type ProfileTab = (typeof profileTabs)[number]
const icons = { Fotos: Grid3x3, Partidas: CalendarDays }

/** Abas do conteúdo do perfil, fixas abaixo da barra superior, com setas, Home e End. */
export default function ProfileTabs({
  value,
  onChange,
}: {
  value: ProfileTab
  onChange: (value: ProfileTab) => void
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Conteúdo do perfil">
      {profileTabs.map((tab, index) => {
        const Icon = icons[tab]
        return (
          <button
            id={`tab-${tab}`}
            key={tab}
            type="button"
            role="tab"
            aria-selected={value === tab}
            aria-controls="profile-content"
            tabIndex={value === tab ? 0 : -1}
            className={value === tab ? 'active' : ''}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % profileTabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + profileTabs.length - 1) % profileTabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? profileTabs.length - 1
                        : null
              if (next === null) return
              event.preventDefault()
              onChange(profileTabs[next])
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll('button')
              buttons?.[next]?.focus()
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {tab}
          </button>
        )
      })}
    </div>
  )
}
