import { useCallback } from 'react'
import { Text, View } from 'react-native'
import { getBracket } from '../../api/brackets'
import { ApiError } from '../../api/client'
import type { TennisBonus } from '../../api/events'
import { useResource } from '../../hooks/useResource'
import { useThemeColors } from '../../hooks/useTheme'
import { LoadError } from '../arena/LoadError'
import { Icon } from '../Icon'
import { BracketView } from './BracketView'

/** Texto honesto de quem não lê a tabela (sem inscrição ativa) ou ainda não tem o que ver (antes de confirmar). */
function TableNote({ title, text }: { title: string; text: string }) {
  const colors = useThemeColors()
  return <View style={{ alignItems: 'center', borderRadius: 16, backgroundColor: colors.surface, padding: 20 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="fork" size={24} color={colors['ink-muted']} /></View>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 6 }}>{title}</Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center' }}>{text}</Text>
  </View>
}

/** Bônus de ranking do tênis (RN16), lembrado na aba enquanto o campeonato não termina. */
function BonusNote({ bonus }: { bonus: TennisBonus }) {
  const colors = useThemeColors()
  return <View testID="tennis-bonus" accessible accessibilityLabel={`Bônus no ranking do tênis: campeão mais ${bonus.champion}, vice mais ${bonus.runner_up} e semifinalistas mais ${bonus.semifinalist}`}
    style={{ flexDirection: 'row', gap: 8, borderRadius: 16, backgroundColor: colors.surface, padding: 12 }}>
    <View style={{ marginTop: 1 }}><Icon name="medal" size={16} color={colors.brand} /></View>
    <Text style={{ flex: 1, minWidth: 0, color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Bônus no ranking do tênis: </Text>
      {`campeão +${bonus.champion}, vice +${bonus.runner_up} e semifinalistas +${bonus.semifinalist} (com ${bonus.min_entries} ou mais inscrições confirmadas${bonus.applies ? '; já vale' : '; ainda não vale'}).`}
    </Text>
  </View>
}

/**
 * Aba Tabela do detalhe do evento (D2), em modo leitura: a árvore (eliminação simples) ou a tabela cruzada com a classificação
 * (todos contra todos), os resultados e, com o evento encerrado, o campeão e as colocações (no tênis, com o bônus do ranking).
 * Só os inscritos, o organizador e a administração leem (`GET /events/{id}/bracket`); quem não está inscrito, ou antes de o
 * organizador confirmar o chaveamento, vê um texto honesto no lugar. `canRead` evita a leitura de quem a API recusaria.
 */
export function BracketPanel({ eventId, canRead, bonus, onExpired, bleed }: {
  eventId: number
  /** Tem inscrição ativa (ou organiza o evento): só estes pedem a tabela à API. */
  canRead: boolean
  bonus: TennisBonus | null
  onExpired: () => void
  /** Margem lateral da tela, para a árvore ocupar a largura inteira. */
  bleed?: number
}) {
  const colors = useThemeColors()
  // A API recusa quem não lê a tabela (403) ou não vê o evento (404): vira `null`, o mesmo texto de quem não está inscrito.
  const load = useCallback(async () => {
    try {
      return await getBracket(eventId)
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return null
      throw cause
    }
  }, [eventId])
  const resource = useResource(load, onExpired, { enabled: canRead, fallback: 'Não foi possível carregar a tabela.' })

  if (!canRead) {
    return <>
      <TableNote title="A tabela é dos inscritos" text="Quem está inscrito acompanha aqui a árvore ou a tabela e os resultados, depois que o organizador confirmar o chaveamento." />
      {bonus ? <BonusNote bonus={bonus} /> : null}
    </>
  }
  if (resource.loading) return <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 12 }}>Carregando a tabela…</Text>
  if (resource.error) {
    return <LoadError size="section" title="Não foi possível carregar a tabela" text={resource.error} cause={resource.errorCause} onRetry={resource.reload} />
  }
  const bracket = resource.data
  if (!bracket) return <TableNote title="A tabela é dos inscritos" text="Quem está inscrito acompanha aqui a árvore ou a tabela e os resultados." />
  if (bracket.state !== 'confirmado') {
    return <>
      <TableNote title="Tabela ainda não definida"
        text={bracket.is_organizer && bracket.state === 'sorteado'
          ? 'O sorteio está feito, mas os inscritos só veem a tabela depois que você confirmar o chaveamento, na gestão do evento.'
          : 'A tabela aparece quando o organizador confirmar o chaveamento.'} />
      {bonus ? <BonusNote bonus={bonus} /> : null}
    </>
  }
  return <>
    <BracketView bracket={bracket} bleed={bleed} />
    {bonus && bracket.event_state !== 'encerrado' ? <BonusNote bonus={bonus} /> : null}
  </>
}
