import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import type { Profile, Sport } from '../../api/client'
import type { EventCard } from '../../api/entries'
import { championshipMeta, championshipTags, championshipsTitle, emptyChampionshipsText } from '../../data/home'
import type { ChampionshipTag } from '../../data/home'
import { useThemeColors } from '../../hooks/useTheme'
import type { ThemeColors } from '../../theme'
import { Icon } from '../Icon'
import { LoadError } from '../arena/LoadError'
import { RoundTile, SeloTile } from '../arena/RoundTile'
import { StateBadge } from '../arena/StateBadge'
import { TextAction } from '../arena/controls'

/** Situação da seção: carregando (perfis ou campeonatos), falha (com a nova tentativa), sem perfis ou com a lista unida. */
export type CampeonatosState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; cause: unknown; onRetry: () => void }
  | { kind: 'no-profiles' }
  | { kind: 'ready'; shown: EventCard[] }

/** Cores das etiquetas claras (preço, vagas e elegibilidade), pelos tokens do tema. */
const tagLook = (c: ThemeColors, kind: ChampionshipTag['kind']) =>
  kind === 'eligible' ? { bg: c['success-bg'], fg: c.brand } : kind === 'spots' ? { bg: c.subtle, fg: c['ink-muted'] } : { bg: c['brand-soft'], fg: c.brand }

function Tag({ tag }: { tag: ChampionshipTag }) {
  const c = useThemeColors()
  if (tag.kind === 'ongoing') return <StateBadge tone="live">{tag.label}</StateBadge>
  const look = tagLook(c, tag.kind)
  return <View style={{ maxWidth: '100%', borderRadius: 99, backgroundColor: look.bg, paddingHorizontal: 8, paddingVertical: 3 }}>
    <Text numberOfLines={1} style={{ color: look.fg, fontSize: 10, fontWeight: '600' }}>{tag.label}</Text>
  </View>
}

/** Uma linha de campeonato: o selo da modalidade (ou o troféu) no ladrilho redondo, nome, "{data e hora} · {local}" e as etiquetas; o toque abre o campeonato. */
function ChampionshipRow({ card, divider, onOpen }: { card: EventCard; divider: boolean; onOpen: (card: EventCard) => void }) {
  const c = useThemeColors()
  const meta = championshipMeta(card)
  const tags = championshipTags(card)
  return <Pressable testID={`campeonato-${card.id}`} accessibilityRole="button" accessibilityLabel={[card.name, meta, ...tags.map(tag => tag.label)].join(', ')}
    accessibilityHint="Abre o campeonato" onPress={() => onOpen(card)}
    style={{ minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderTopWidth: divider ? 1 : 0, borderTopColor: c.line }}>
    {card.sport ? <SeloTile sport={card.sport} size={40} />
      : <RoundTile size={40} testID="campeonato-sem-modalidade"><Icon name="trophy" size={20} color={c['icon-tile-ink']} /></RoundTile>}
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: c.heading, fontSize: 13, fontWeight: '700' }}>{card.name}</Text>
      <Text numberOfLines={1} style={{ marginTop: 2, color: c['ink-muted'], fontSize: 11 }}>{meta}</Text>
      <View style={{ marginTop: 7, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {tags.map(tag => <Tag key={tag.kind} tag={tag} />)}
      </View>
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'center' }}><Icon name="chevron" size={16} color={c['ink-muted']} /></View>
  </Pressable>
}

/**
 * Campeonatos do Início: o título pela cidade dos perfis esportivos ("Campeonatos em {cidade}", "Campeonatos perto de você"
 * ou "Perto de você"), "Ver todos" com perfis (abre a lista na modalidade de `allSport`) e, conforme `state`, o carregamento,
 * o erro só desta seção com "Tentar novamente", o convite "Configure suas modalidades" sem perfis, o estado vazio com "Ver
 * campeonatos" ou os campeonatos reais (os 2 primeiros da união das leituras por perfil). Cartões claros em `surface`.
 */
export function Campeonatos({ state, profiles, allSport, onOpenEvent, onOpenEvents, onOpenModalities }: {
  state: CampeonatosState
  /** Perfis esportivos lidos; `null` enquanto carregam ou se a leitura falhou. */
  profiles: readonly Profile[] | null
  /** Modalidade de "Ver todos" e "Ver campeonatos" (`championshipsSport`); `null` sem perfis, e então não há "Ver todos". */
  allSport: Sport | null
  onOpenEvent: (card: EventCard) => void
  onOpenEvents: (sport: Sport) => void
  onOpenModalities: () => void
}) {
  const c = useThemeColors()
  const card = { borderRadius: 16, borderWidth: 1, borderColor: c['surface-edge'], backgroundColor: c.surface } as const
  return <View testID="campeonatos">
    <View className="mb-2 flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" numberOfLines={1} className="shrink text-[16px] font-bold text-heading">{championshipsTitle(profiles)}</Text>
      {allSport ? <TextAction title="Ver todos" accessibilityLabel="Ver todos os campeonatos" onPress={() => onOpenEvents(allSport)} /> : null}
    </View>
    {state.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={{ color: c['ink-muted'], fontSize: 13 }}>Carregando campeonatos…</Text>
      : state.kind === 'error' ? <View style={card}>
        <LoadError size="section" title="Não foi possível carregar os campeonatos" text={state.message} cause={state.cause} onRetry={state.onRetry} />
      </View>
        : state.kind === 'no-profiles' ? <Pressable testID="campeonatos-sem-perfis" accessibilityRole="button" accessibilityLabel="Configure suas modalidades. Para ver campeonatos perto de você"
          accessibilityHint="Abre suas modalidades" onPress={onOpenModalities} style={{ ...card, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c['icon-tile'] }}>
            <Icon name="map-pin" size={20} color={c['icon-tile-ink']} />
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: c.heading, fontSize: 13, fontWeight: '700' }}>Configure suas modalidades</Text>
            <Text numberOfLines={2} style={{ marginTop: 2, color: c['ink-muted'], fontSize: 11 }}>Para ver campeonatos perto de você</Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="chevron" size={18} color={c['ink-muted']} /></View>
        </Pressable>
          : state.shown.length === 0 ? <View testID="campeonatos-vazio" style={{ ...card, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 18 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="trophy" size={24} color={c['ink-muted']} /></View>
            <Text style={{ marginTop: 8, color: c.heading, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{emptyChampionshipsText(profiles ?? [])}</Text>
            {allSport ? <TextAction title="Ver campeonatos" accessibilityLabel="Ver a lista de campeonatos" onPress={() => onOpenEvents(allSport)} /> : null}
          </View>
            : <View accessibilityLabel="Campeonatos" style={{ ...card, overflow: 'hidden' }}>
              {state.shown.map((item, index) => <ChampionshipRow key={item.id} card={item} divider={index > 0} onOpen={onOpenEvent} />)}
            </View>}
  </View>
}
