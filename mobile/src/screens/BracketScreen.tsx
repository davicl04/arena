import { useCallback, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { confirmBracket, drawBracket, getBracket, swapBracket } from '../api/brackets'
import type { Bracket } from '../api/brackets'
import { ApiError } from '../api/client'
import { ActionButton, BusyStatus } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { BracketView } from '../components/brackets/BracketView'
import { planCompetitors, slotName } from '../components/brackets/bracketText'
import { Icon } from '../components/Icon'
import Sheet from '../components/Sheet'
import { toast } from '../components/toast/toastStore'
import { useResource } from '../hooks/useResource'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { useThemeColors } from '../hooks/useTheme'
import { formatDeadline } from '../utils/format'

/** Nome de quem ocupa o lugar `place` da primeira fase (para a frase da troca). */
function nameAtPlace(bracket: Bracket, place: number): string {
  for (const node of bracket.rounds[0]?.nodes ?? []) {
    for (const slot of node.slots) if (slot.place === place) return slotName(slot)
  }
  return 'o lugar escolhido'
}

const cardStyle = (backgroundColor: string) => ({ gap: 12, borderRadius: 16, backgroundColor, padding: 14 }) as const
const small = (color: string) => ({ color, fontSize: 11, lineHeight: 17 }) as const

/** Aviso do que impede o sorteio agora (`permissions.draw_blocker`). */
function Blocker({ text }: { text: string }) {
  const colors = useThemeColors()
  return <View testID="draw-blocker" accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, backgroundColor: colors['warning-bg'], padding: 10 }}>
    <View style={{ marginTop: 1 }}><Icon name="triangle-alert" size={16} color={colors.warning} /></View>
    <Text style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{text}</Text>
  </View>
}

function Info({ icon, children }: { icon: 'info' | 'hand'; children: string }) {
  const colors = useThemeColors()
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <View style={{ marginTop: 1 }}><Icon name={icon} size={15} color={colors.brand} /></View>
    <Text style={[small(colors['ink-muted']), { flex: 1, minWidth: 0 }]}>{children}</Text>
  </View>
}

/**
 * Chaveamento do campeonato (B3 + T2), do lado do organizador. Sem sorteio: explica e sorteia. Sorteado: mostra a árvore
 * espelhada (eliminação simples, com a troca de lugares por toque) ou a tabela cruzada (todos contra todos), com "Sortear de
 * novo" e "Confirmar chaveamento" (folha de confirmação). Confirmado: a árvore ou a tabela com os resultados, e o atalho
 * para as partidas. `permissions` (da API) decide o que aparece; `draw_blocker` explica o que impede o sorteio agora. Um
 * `409` em qualquer ação relê o chaveamento, para os botões acompanharem o estado de agora.
 */
export default function BracketScreen({ params, navigation, onExpired }: ScreenProps<'event-bracket'>) {
  const colors = useThemeColors()
  const eventId = params.eventId
  const load = useCallback(() => getBracket(eventId), [eventId])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o chaveamento.' })
  const bracket = resource.data
  const action = useSubmit(onExpired)
  const [picked, setPicked] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  /** O chaveamento relido depois de um `409`: a tela decide com ele, não com o estado velho do fechamento. */
  const reread = useRef<Bracket | null>(null)

  const elimination = bracket?.kind === 'eliminacao_simples'
  const unit = bracket?.sport === 'tenis' ? 'atletas' : 'times'
  const one = bracket?.sport === 'tenis' ? 'atleta' : 'time'
  const title = bracket && !elimination ? 'Tabela' : 'Chaveamento'

  if (!bracket) {
    return <View style={{ flex: 1 }}>
      <TeamsPlate bottom={16}><DarkTopBar eyebrow="Organizador" title="Chaveamento" onBack={navigation.back} /></TeamsPlate>
      <View style={{ padding: 20 }}>
        {resource.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 12 }}>Carregando o chaveamento…</Text> : null}
        {resource.error ? <LoadError size="screen" title="Não foi possível carregar o chaveamento" text={resource.error} cause={resource.errorCause} onRetry={resource.reload} /> : null}
      </View>
    </View>
  }

  const current: Bracket = bracket
  const { permissions } = current

  /**
   * Chama a API e, num `409` (já confirmado em outra aba, comprovante em análise, o sorteio mudou), relê o chaveamento: os
   * botões passam a seguir o estado de agora (`permissions`), e a mensagem do servidor continua visível.
   */
  async function guarded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const fresh = await getBracket(eventId)
          reread.current = fresh
          resource.setData(fresh)
        } catch (again) {
          if (again instanceof ApiError && again.status === 401) onExpired()
        }
      }
      throw cause
    }
  }

  async function draw() {
    const next = await action.run(() => guarded(() => drawBracket(eventId)), 'Não foi possível sortear.')
    if (!next) return
    resource.setData(next)
    setPicked(null)
    if (current.state === 'sorteado') toast.success('Sorteio refeito.', { description: 'As trocas anteriores foram descartadas.' })
    else toast.success('Sorteio feito.', { description: 'Confira e confirme quando estiver pronto.' })
  }
  async function pick(place: number) {
    // Os passos da troca são instrução na tela (a dica abaixo da árvore); só o resultado vira toast.
    if (picked === null) { setPicked(place); return }
    if (picked === place) { setPicked(null); return }
    const first = nameAtPlace(current, picked)
    const second = nameAtPlace(current, place)
    const next = await action.run(() => guarded(() => swapBracket(eventId, picked, place)), 'Não foi possível trocar os lugares.')
    setPicked(null)
    if (!next) return
    resource.setData(next)
    toast.success(`${first} e ${second} trocaram de lugar.`)
  }
  async function confirm() {
    reread.current = null
    const next = await action.run(() => guarded(() => confirmBracket(eventId)), 'Não foi possível confirmar o chaveamento.')
    if (!next) {
      // Já confirmado (ou desfeito) em outro lugar: a folha não faz mais sentido; o aviso do servidor passa para a tela.
      const fresh = reread.current as Bracket | null
      if (fresh && fresh.state !== 'sorteado') setConfirming(false)
      return
    }
    resource.setData(next)
    setConfirming(false)
    setPicked(null)
    toast.success(elimination ? 'Chaveamento confirmado.' : 'Tabela confirmada.',
      { description: `${elimination ? 'As partidas foram criadas' : 'As rodadas foram criadas'} e os ${unit} foram avisados.` })
  }

  const drawn = current.state === 'sorteado'
  const confirmed = current.state === 'confirmado'
  const swappable = drawn && permissions.can_swap && elimination
  const drawLabel = elimination ? 'Sortear chaveamento' : 'Sortear rodadas'
  const competitors = planCompetitors(current.rounds).length
  const hint = !swappable ? null : picked === null ? `Toque em dois ${unit} para trocá-los de lugar.` : `Agora toque no ${one} que vai para o lugar de ${nameAtPlace(current, picked)}.`
  const confirmLabel = elimination ? 'Confirmar chaveamento' : 'Confirmar tabela'

  return <View style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
      <TeamsPlate bottom={16}><DarkTopBar eyebrow={current.event_name} title={title} onBack={navigation.back} /></TeamsPlate>

      <View style={{ padding: 16, gap: 14 }}>
        {current.state === 'sem_chaveamento' ? <View style={cardStyle(colors.surface)}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ marginTop: 1 }}><Icon name="shuffle" size={22} color={colors.brand} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 }}>{elimination ? 'Sorteie o chaveamento' : 'Sorteie as rodadas'}</Text>
              <Text style={[small(colors['ink-muted']), { marginTop: 4, fontSize: 11.5 }]}>
                {elimination
                  ? `O sorteio monta a chave com os ${unit} confirmados. Quem ficar sem adversário na primeira fase tem folga e passa direto. Depois você pode trocar dois ${unit} de lugar.`
                  : `O sorteio define a ordem das rodadas: cada ${one} joga uma vez por rodada e, com número ímpar, um folga em cada rodada.`}
              </Text>
            </View>
          </View>
          {permissions.draw_blocker ? <Blocker text={permissions.draw_blocker} /> : null}
          <ActionButton block icon="shuffle" title={action.busy ? 'Sorteando…' : drawLabel} accessibilityLabel={drawLabel} disabled={!permissions.can_draw} busy={action.busy} onPress={() => void draw()} />
        </View> : null}

        {drawn ? <View style={{ gap: 10 }}>
          <Info icon="info">
            {elimination
              ? `Sorteio${current.draw_count && current.draw_count > 1 ? ` nº ${current.draw_count}` : ''}${current.drawn_at ? ` em ${formatDeadline(current.drawn_at)}` : ''}: ${competitors} ${unit} confirmados. Os ${unit} só veem a chave depois que você confirmar.`
              : `No todos contra todos não há encaixe manual: a ordem das rodadas sai do sorteio. Os ${unit} só veem a tabela depois que você confirmar.`}
          </Info>
          {hint ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="hand" size={16} color={colors.brand} />
            <Text style={{ flex: 1, minWidth: 0, color: colors.brand, fontSize: 11.5, fontWeight: '700', lineHeight: 17 }}>{hint}</Text>
          </View> : null}
        </View> : null}

        {drawn || confirmed
          ? <BracketView bracket={current} picked={swappable ? picked : undefined} onPick={swappable ? place => void pick(place) : undefined} busy={action.busy} />
          : null}

        {drawn && permissions.draw_blocker ? <Blocker text={permissions.draw_blocker} /> : null}

        {drawn ? <View style={{ gap: 8 }}>
          <ActionButton block tone="outline" icon="shuffle" title="Sortear de novo" disabled={!permissions.can_draw} busy={action.busy} onPress={() => void draw()} />
          <ActionButton block tone="brand" icon="check" title={confirmLabel} disabled={!permissions.can_confirm || action.busy}
            onPress={() => setConfirming(true)} />
          <Info icon="info">{`Depois de confirmar, os ${unit} veem ${elimination ? 'a chave' : 'a tabela'} e você agenda as partidas.`}</Info>
        </View> : null}

        {confirmed ? <View style={{ gap: 8 }}>
          <Info icon="info">
            {`${elimination ? 'Chaveamento' : 'Tabela'} confirmado${current.confirmed_at ? ` em ${formatDeadline(current.confirmed_at)}` : ''}. ${current.event_state === 'encerrado' ? 'O campeonato terminou.' : 'Os vencedores avançam sozinhos quando o resultado de cada jogo é definido.'}`}
          </Info>
          <ActionButton block tone="brand" icon="calendar-days" title="Ver e agendar partidas" onPress={() => navigation.go('event-matches', { eventId })} />
        </View> : null}
      </View>
    </ScrollView>

    {confirming ? <Sheet title={confirmLabel} onClose={() => setConfirming(false)}>
      <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{current.event_name}</Text>
      <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 19 }}>
        {`As partidas são criadas e os ${unit} inscritos recebem ${elimination ? 'a chave' : 'a tabela'}. Depois de confirmar, `}
        <Text style={{ fontWeight: '700' }}>não dá mais para trocar os lugares nem sortear de novo</Text>.
      </Text>
      <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>
        Reservas e comprovantes recusados ainda abertos são liberados. Com algum comprovante em análise, a confirmação é recusada até você analisá-lo.
      </Text>
      <BusyStatus text={action.busy ? 'Confirmando o chaveamento…' : ''} />
      <View style={{ marginTop: 14 }}>
        <ActionButton block tone="brand" icon="check" title={action.busy ? 'Confirmando…' : 'Confirmar'} accessibilityLabel="Confirmar" busy={action.busy} onPress={() => void confirm()} />
      </View>
    </Sheet> : null}
  </View>
}
