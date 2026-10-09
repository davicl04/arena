const tabs = ['Atividades', 'Fotos', 'Partidas']

export default function ProfileTabs({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Conteúdo do perfil">
      {tabs.map((tab, index) => (
        <button
          id={`tab-${tab}`}
          key={tab}
          role="tab"
          aria-selected={value === tab}
          aria-controls="profile-content"
          tabIndex={value === tab ? 0 : -1}
          className={value === tab ? 'active' : ''}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : null
            if (next === null) return
            event.preventDefault()
            onChange(tabs[next])
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll('button')
            buttons?.[next]?.focus()
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
