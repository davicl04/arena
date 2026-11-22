import { sports } from '@/api/client'
import type { Profile, Sport } from '@/api/client'
import type { MeStandings } from '@/api/play'
import SportIcon from '@/components/SportIcon'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { modalityStanding } from '@/components/arena/modalityStanding'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { tiers } from '@/data/arena'
import type { RunDistance } from '@/data/arena'
import { pillAccessibilityLabel, pillMetric, pillStatus, pillTexts } from '@/data/home'
import type { PillStatus } from '@/data/home'

/** Destino do toque numa pílula com perfil: o Ranking da modalidade (na corrida, também na distância do elo). */
export interface PillRanking { sport: Sport; distance?: RunDistance }

/** Conteúdo abaixo do nome da modalidade, conforme a situação (emblema e métrica, situação e detalhe, ou carregamento). */
function PillBody({ status }: { status: PillStatus }) {
  if (status.kind === 'tier') {
    const metric = pillMetric(status.metric, status.distanceKm)
    return <>
      <span data-slot="pill-line" className="flex max-w-full items-center gap-[3px] font-semibold">
        <TierEmblem tier={status.tier} size="xs" decorative />
        <span className="truncate">{tiers[status.tier]?.name ?? status.tier}</span>
      </span>
      {metric && <small data-slot="pill-line" className="mt-px line-clamp-2 max-w-full text-[10px] text-white/75 tabular-nums">{metric}</small>}
    </>
  }
  const texts = pillTexts(status)
  if (!texts) return <span data-slot="pill-line" className="font-bold text-white/70">…</span>
  return <>
    <span data-slot="pill-line" className="line-clamp-2 max-w-full text-white/70">{texts.status}</span>
    {texts.detail && <small data-slot="pill-line" className="mt-px line-clamp-2 max-w-full text-[10px] text-white/75">{texts.detail}</small>}
  </>
}

/**
 * Pílulas do Início ("Seu elo"): o cabeçalho com "Ver elos" (abre o Ranking) e um bloco escuro por design (`forest` com o
 * Coliseu em marca-d'água, igual nos dois temas) com uma pílula por modalidade, na ordem de `sports` (futebol, tênis e
 * corrida). Cada pílula mostra o ícone, o nome e, pela regra de `modalityStanding` (`GET /me/standings`, lido uma vez pelo
 * Início): o emblema e o nome do elo com a métrica; "{n} de {3}" e "Sem classificação"; na corrida, "Sem marca"; sem perfil
 * esportivo, "Sem perfil" e "Configurar"; o carregamento; ou "Classificação indisponível". Nunca mostra elo para quem está em
 * classificação nem a posição no ranking. Com perfil, a pílula abre o Ranking da modalidade (na corrida, na distância do elo);
 * sem perfil, a tela de modalidades. Mesmas regras e textos das Pílulas do Expo.
 */
export function Pilulas({ standings, standingsLoading, profiles, profilesLoading, onOpenRanking, onOpenModalities }: {
  /** Classificação lida (`GET /me/standings`); `null` enquanto carrega ou se a leitura falhou. */
  standings: Partial<MeStandings> | null
  standingsLoading: boolean
  /** Perfis esportivos lidos; `null` enquanto carregam ou se a leitura falhou: as pílulas seguem a classificação. */
  profiles: readonly Profile[] | null
  profilesLoading: boolean
  /** Sem destino, o Ranking como está ("Ver elos"). */
  onOpenRanking: (target?: PillRanking) => void
  onOpenModalities: () => void
}) {
  return <section data-testid="pilulas">
    <SectionTitle title="Seu elo" action={<Button variant="link" onClick={() => onOpenRanking()}>Ver elos</Button>} />
    <div data-slot="pilulas-plate" className="relative overflow-hidden rounded-[22px] bg-forest p-3 text-white">
      <span aria-hidden="true" className="pointer-events-none absolute -top-2.5 -right-5 h-[110px] w-[200px] bg-white opacity-[0.07] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      <div className="relative grid grid-cols-3 gap-1.5">
        {sports.map(({ value: sport, label }) => {
          const hasProfile = profiles ? profiles.some(profile => profile.sport === sport) : null
          const standing = standings ? modalityStanding(sport, standings) : null
          const status = pillStatus(sport, { standing, loading: standingsLoading || profilesLoading, hasProfile })
          const open = status.kind === 'no-profile' ? onOpenModalities
            : () => onOpenRanking(status.kind === 'tier' && status.distanceKm ? { sport, distance: status.distanceKm } : { sport })
          return <button key={sport} type="button" data-slot="pill" data-sport={sport} onClick={open}
            aria-label={pillAccessibilityLabel(label, status)} aria-busy={status.kind === 'loading' || undefined}
            className="flex min-h-11 min-w-0 cursor-pointer flex-col items-center gap-[3px] rounded-xl border-0 bg-white/7 px-1 py-2 text-center text-[10px] leading-[1.3] text-white [--sport-icon-color:rgb(255_255_255/0.82)] hover:bg-white/11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint">
            <SportIcon sport={sport} size={20} mask />
            <b className="block max-w-full truncate text-[11px]">{label}</b>
            <PillBody status={status} />
          </button>
        })}
      </div>
    </div>
  </section>
}
