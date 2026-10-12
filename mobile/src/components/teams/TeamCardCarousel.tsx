import { useCallback, useEffect, useRef } from 'react'
import { AccessibilityInfo, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import type { TeamCard } from '../../api/teams'
import { colors } from '../../theme'
import { TeamIdCard } from './TeamIdCard'
import { ActionButton } from '../arena/controls'
import { Icon } from '../Icon'

/** Largura do cartão em relação à tela e espaço entre cartões (M3: 84% e 12 pt). */
const CARD_RATIO = 0.84
const GAP = 12

/** Medidas do carrossel para a largura de tela dada: cartão, passo (cartão + espaço) e margem lateral que centraliza o cartão. */
export function carouselMetrics(screenWidth: number) {
  const card = Math.round(screenWidth * CARD_RATIO)
  return { card, step: card + GAP, side: Math.max(0, Math.round((screenWidth - card) / 2)) }
}

/** Índice do quadro mais próximo do deslocamento horizontal, limitado a `count` quadros. */
export const slideAt = (offset: number, step: number, count: number) => Math.min(Math.max(Math.round(offset / step), 0), count - 1)

/**
 * Carrossel de carteirinhas (M3): uma C5 por time, deslizando na placa com encaixe por cartão, e um último quadro
 * tracejado "Criar time". O cartão centralizado define o time selecionado (e o elenco mostrado abaixo). Os pontos abaixo
 * levam a cada cartão (alvos de 44 pt, com rótulo) e a troca de time é anunciada para leitores de tela.
 */
export function TeamCardCarousel({ teams, selectedId, onSelect, onCreate, onInvite, onLink, onEdit, onLeave }: {
  teams: TeamCard[]
  selectedId: number | null
  onSelect: (teamId: number) => void
  onCreate: () => void
  onInvite: (team: TeamCard) => void
  onLink: (team: TeamCard) => void
  onEdit: (team: TeamCard) => void
  onLeave: (team: TeamCard) => void
}) {
  const { width } = useWindowDimensions()
  const { card, step, side } = carouselMetrics(width)
  const scroller = useRef<ScrollView>(null)
  /** Time que a própria rolagem acabou de selecionar: a tela não precisa rolar de novo até ele. */
  const fromScroll = useRef<number | null>(null)
  /** O deslocamento inicial só vale depois que o conteúdo tem largura (antes disso a rolagem seria limitada a 0). */
  const placed = useRef(false)
  const selectedIndex = Math.max(0, teams.findIndex(team => team.id === selectedId))
  const slideCount = teams.length + 1

  const scrollToSlide = useCallback((index: number, animated: boolean) => scroller.current?.scrollTo({ x: index * step, y: 0, animated }), [step])
  useEffect(() => {
    const origin = fromScroll.current
    fromScroll.current = null
    if (selectedId !== null && origin === selectedId) return
    scrollToSlide(selectedIndex, origin !== null)
    // Só reage à troca de time ou de quantidade; a rolagem do usuário não deve ser refeita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, teams.length, step])

  function select(index: number) {
    const team = teams[index]
    if (team && team.id !== selectedId) {
      fromScroll.current = team.id
      onSelect(team.id)
      // O VoiceOver não lê regiões vivas: a troca de time é anunciada à mão (no Android, a legenda abaixo dos pontos é a região viva).
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${team.name}, time ${index + 1} de ${teams.length}`)
    }
  }
  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = slideAt(event.nativeEvent.contentOffset.x, step, slideCount)
    // O quadro "Criar time" não troca o elenco mostrado.
    if (index < teams.length) select(index)
  }
  function goTo(index: number) {
    const next = Math.min(Math.max(index, 0), slideCount - 1)
    if (next < teams.length) select(next)
    scrollToSlide(next, true)
  }

  return <View accessibilityLabel="Seus times" accessibilityHint="Deslize para trocar de time. O elenco abaixo acompanha o cartão escolhido.">
    <ScrollView ref={scroller} testID="team-carousel" horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={step} snapToAlignment="start"
      disableIntervalMomentum onContentSizeChange={() => { if (!placed.current && teams.length) { placed.current = true; scrollToSlide(selectedIndex, false) } }} onMomentumScrollEnd={settle} onScrollEndDrag={settle} scrollEventThrottle={16}
      contentContainerStyle={{ paddingHorizontal: side, paddingTop: 16, paddingBottom: 6, gap: GAP }}>
      {teams.map((team, index) => {
        const representative = team.my_role === 'representante'
        return <View key={team.id} testID={`team-slide-${team.id}`} accessibilityLabel={`${team.name}, ${index + 1} de ${teams.length}`} style={{ width: card }}>
          <TeamIdCard fill team={team} actions={representative ? <>
            <ActionButton tone="mint" grow icon="user-plus" title="Convidar" accessibilityLabel={`Convidar para o ${team.name}`} onPress={() => onInvite(team)} />
            <ActionButton iconOnly tone="line" icon="qr-code" title="Link e QR do time" accessibilityLabel="Link e QR do time" onPress={() => onLink(team)} />
            <ActionButton iconOnly tone="line" icon="pencil" title="Editar time" accessibilityLabel="Editar time" onPress={() => onEdit(team)} />
          </> : <ActionButton grow tone="line" icon="log-out" title="Sair do time" accessibilityLabel={`Sair do ${team.name}`} onPress={() => onLeave(team)} />} />
        </View>
      })}
      <Pressable testID="team-slide-new" accessibilityRole="button" accessibilityLabel="Criar time" onPress={onCreate}
        style={{ width: card, minHeight: 236, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' }}>
        <Icon name="shield-plus" size={30} color={colors.mint} />
        <Text style={{ color: colors.mint, fontSize: 13, fontWeight: '700' }}>Criar time</Text>
      </Pressable>
    </ScrollView>
    <View accessibilityLabel="Paginação dos times" style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 2, paddingBottom: 10 }}>
      {[...teams.map(team => team.name), 'Criar time'].map((name, index) => {
        const active = index === selectedIndex && index < teams.length
        return <Pressable key={`${name}-${index}`} accessibilityRole="button" accessibilityLabel={`Mostrar ${name}`} accessibilityState={{ selected: active }} onPress={() => goTo(index)}
          style={{ minHeight: 44, minWidth: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <View testID={active ? 'team-dot-active' : 'team-dot'} style={{ height: 6, width: active ? 18 : 6, borderRadius: 3, backgroundColor: active ? colors.mint : 'rgba(255,255,255,0.22)' }} />
        </Pressable>
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={{ textAlign: 'center', paddingBottom: 12, color: 'rgba(255,255,255,0.56)', fontSize: 10.5 }}>
      {teams.length ? `Time ${selectedIndex + 1} de ${teams.length}` : 'Nenhum time ainda'}
    </Text>
  </View>
}
