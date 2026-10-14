import { Pressable, Text, View, useWindowDimensions } from 'react-native'
import type { RunBest, RunFilter } from '../../api/runs'
import { runDistances, shownTier, tiers } from '../../data/arena'
import type { RunDistance } from '../../data/arena'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'
import { ArenaMark } from '../arena/ArenaMark'
import { TextAction } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { TierEmblem } from '../arena/TierEmblem'
import { formatRunDate, originLabel } from '../play/runView'
import { formatDuration } from '../play/tierLines'
import { RunSpark } from './RunSpark'

/*
 * "Suas marcas" (K4), abaixo da placa na aba Corrida: um cartão por distância com o melhor tempo das últimas 52 semanas,
 * o elo e a origem ("Treino · 12 out" ou o nome da prova), o minigráfico de evolução e o "+" que abre o registro já nessa
 * distância. Tocar no cartão abre o histórico. A última linha abre o histórico das distâncias fora das cinco. "Ver ranking"
 * (no título) abre o Ranking da corrida na distância escolhida na placa (a do contorno verde).
 */

/** Largura da tela a partir da qual os cartões ficam em duas colunas; abaixo, um por linha (o nome e o elo não se espremem). */
export const TWO_COLUMNS_FROM = 360

/** Texto lido do cartão: elo, melhor tempo e origem, ou o convite quando não há marca. */
export function cardSummary(card: RunBest, now?: Date): string {
  const label = runDistances.find(item => item.value === card.distance_km)?.label ?? `${card.distance_km} km`
  const best = card.best
  if (!best) return `${label}: sem marca. Registre um treino ou prova para entrar no ranking.`
  const tier = shownTier(card.tier, card.marks, 1)
  return `${label}: ${tier ? tiers[tier].name : 'marca registrada'}, melhor tempo ${formatDuration(best.duration_s)}, ${originLabel(best.origin)}, ${formatRunDate(best.date, now)}. Melhor nas últimas 52 semanas.`
}

function Card({ card, selected, wide, now, onAdd, onOpen }: {
  card: RunBest
  selected: boolean
  wide: boolean
  now?: Date
  onAdd: (distance: RunDistance) => void
  onOpen: (filter: RunFilter) => void
}) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const label = runDistances.find(item => item.value === card.distance_km)?.label ?? `${card.distance_km} km`
  const tier = shownTier(card.tier, card.marks, 1)
  const best = card.best
  return <View testID={`run-mark-${card.distance_km}`} accessibilityState={{ selected }}
    style={{ width: wide ? '48.5%' : '100%', borderRadius: 16, backgroundColor: c.surface, borderWidth: 2, borderColor: selected ? c.brand : c['surface-edge'] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Histórico dos ${label}. ${cardSummary(card, now)}`} accessibilityHint="Abre as marcas registradas nesta distância" onPress={() => onOpen(`${card.distance_km}`)}
      style={{ minHeight: 44, gap: 8, padding: 10 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 40 }}>
        {tier
          ? <TierEmblem tier={tier} size="md" decorative />
          : <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: night ? 'rgba(135,151,142,0.4)' : 'rgba(96,105,101,0.4)' }}>
            <ArenaMark width={18} height={14} color={c['ink-muted']} />
          </View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.ink, fontSize: 13, fontWeight: '800' }}>{label}</Text>
          <Text numberOfLines={1} style={{ color: c['ink-muted'], fontSize: 9.5 }}>{tier ? tiers[tier].name : best ? 'Marca registrada' : 'Sem marca'}</Text>
        </View>
      </View>
      {best
        ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: 8, rowGap: 4 }}>
            <Text style={{ color: c.ink, fontSize: 20, lineHeight: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatDuration(best.duration_s)}</Text>
            <RunSpark series={card.series} />
          </View>
          <View>
            <Text numberOfLines={1} style={{ color: c.ink, fontSize: 9.5, fontWeight: '700' }}>{originLabel(best.origin)} · {formatRunDate(best.date, now)}</Text>
            <Text style={{ color: c['ink-muted'], fontSize: 9.5, lineHeight: 14 }}>Melhor nas últimas 52 semanas</Text>
          </View>
        </View>
        : <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: c['ink-muted'], fontSize: 9.5, lineHeight: 14 }}>Registre um treino ou prova para entrar no ranking dos {label}.</Text>}
    </Pressable>
    {/* Alvo de 44 pt; o círculo de 30 pt desenhado dentro dele é o "+" dos protótipos. */}
    <Pressable accessibilityRole="button" accessibilityLabel={`Registrar ${label}`} onPress={() => onAdd(card.distance_km)}
      style={{ position: 'absolute', top: 1, right: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1.5, borderColor: c['line-strong'], backgroundColor: c.surface }}>
        <Icon name="plus" size={17} color={c.brand} />
      </View>
    </Pressable>
  </View>
}

export function RunMarks({ items, loading, error, errorCause, selected, onAdd, onOpen, onRetry, onOpenRanking, now }: {
  items: RunBest[]
  loading: boolean
  error: string
  /** O erro lançado pelo carregamento (para o `LoadError` reconhecer a falta de conexão). */
  errorCause?: unknown
  /** Distância escolhida nos chips da placa: o cartão ganha o contorno verde. */
  selected: RunDistance
  /** O "+" do cartão: registrar já nessa distância. */
  onAdd: (distance: RunDistance) => void
  onOpen: (filter: RunFilter) => void
  onRetry: () => void
  /** "Ver ranking": abre o Ranking da corrida na distância escolhida (a do contorno verde). */
  onOpenRanking: (distance: RunDistance) => void
  /** Hoje, para os testes (o ano só aparece em datas de outro ano). */
  now?: Date
}) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const wide = useWindowDimensions().width >= TWO_COLUMNS_FROM
  return <View accessibilityLabel="Suas marcas" testID="run-marks">
    <View style={{ marginTop: 22, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ color: night ? c.eyebrow : c.brand, fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>Suas marcas</Text>
      <TextAction title="Ver ranking" accessibilityLabel="Ver ranking" onPress={() => onOpenRanking(selected)} />
    </View>
    {loading && !items.length ? <Text accessibilityLiveRegion="polite" style={{ color: c['ink-muted'], fontSize: 12 }}>Carregando suas marcas…</Text> : null}
    {error && !items.length ? <LoadError size="section" title="Não foi possível carregar suas marcas" text={error} cause={errorCause} onRetry={onRetry} /> : null}
    {items.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
      {items.map(card => <Card key={card.distance_km} card={card} selected={card.distance_km === selected} wide={wide} now={now} onAdd={onAdd} onOpen={onOpen} />)}
      <Pressable accessibilityRole="button" accessibilityLabel="Outras distâncias" accessibilityHint="Fora de 3, 5, 10, 21 e 42 km, a marca fica só no histórico" onPress={() => onOpen('outra')}
        style={{ width: '100%', minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c['line-strong'], paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c['icon-tile'] }}><Icon name="history" size={17} color={c['icon-tile-ink']} /></View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.ink, fontSize: 12, fontWeight: '700' }}>Outras distâncias</Text>
          <Text style={{ color: c['ink-muted'], fontSize: 10, lineHeight: 14 }}>Fora de 3, 5, 10, 21 e 42 km, a marca fica só no histórico.</Text>
        </View>
        <Icon name="chevron" size={16} color={c['ink-muted']} />
      </Pressable>
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <Icon name="timer" size={13} color={c['ink-muted']} />
        <Text style={{ flex: 1, color: c['ink-muted'], fontSize: 10, lineHeight: 15 }}>O ranking usa o melhor tempo das últimas 52 semanas de cada distância.</Text>
      </View>
    </View> : null}
  </View>
}
