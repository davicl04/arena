import { Text, View } from 'react-native'
import { acceptProposal, declineProposal } from '../../api/matchmaking'
import type { Proposal } from '../../api/matchmaking'
import { footballFormat } from '../../data/arena'
import { sideName } from '../../data/match'
import { isStale, useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { ActionButton, TextAction } from '../arena/controls'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import { ActionSheet } from '../arena/ActionSheet'
import { Countdown } from './Countdown'
import { SideBadge } from './SideBadge'

export type ProposalAnswer = 'aceitar' | 'recusar'

/**
 * Proposta (P2) numa folha `forest`: brasões e elos dos dois lados, a contagem regressiva das 2 h e as respostas. Só quem
 * age pelo lado (o representante, ou o atleta no tênis) recusa e aceita; o membro lê "Só os representantes aceitam.".
 * "Responder depois" (e fechar a folha) não chama a API: a proposta continua na placa até o prazo.
 *
 * `onAnswer` recebe a proposta devolvida pelo servidor, com a resposta dada; quem chama decide o que vem depois (ir à
 * partida quando os dois aceitam, reler a placa). Os botões ficam ocupados até a tela refletir a resposta.
 */
export function ProposalSheet({ proposal, onLater, onAnswer, onOpenMatch, onElapsed, onStale, onExpired }: {
  proposal: Proposal
  onLater: () => void
  onAnswer: (updated: Proposal, answer: ProposalAnswer) => void | Promise<void>
  /** Proposta já confirmada (`combinando`): abre a partida. */
  onOpenMatch: (matchId: number) => void
  /** O prazo de 2 h passou: a placa lê de novo. */
  onElapsed: () => void
  /** O servidor recusou a resposta porque a proposta mudou (404 ou 409; o toast de aviso já mostrou a mensagem dele): a tela fecha a folha e lê a placa de novo. */
  onStale: () => void
  onExpired: () => void
}) {
  const { busy, run } = useSubmit(onExpired)
  const mine = proposal.sides.find(side => side.side === proposal.my_side)
  const other = proposal.sides.find(side => side.side !== proposal.my_side)
  const open = proposal.state === 'proposta'
  const iAccepted = Boolean(mine?.accepted_at)
  const otherName = sideName(other)
  const athletes = proposal.sport === 'tenis'
  const format = proposal.format ? footballFormat[proposal.format]?.label : 'Tênis'
  const heading = open ? 'Adversário encontrado' : proposal.state === 'combinando' ? 'Partida confirmada' : 'Proposta encerrada'

  async function answer(kind: ProposalAnswer) {
    await run(async () => {
      const updated = await (kind === 'aceitar' ? acceptProposal : declineProposal)(proposal.match_id)
      await onAnswer(updated, kind)
    }, kind === 'aceitar' ? 'Não foi possível aceitar a proposta.' : 'Não foi possível recusar a proposta.',
    // Proposta que já não está pendente (404 ou 409: o outro lado recusou, o prazo passou): o toast de aviso já saiu; a placa lê de novo.
    cause => { if (isStale(cause)) onStale() })
  }

  return <ActionSheet title={`${heading} · ${format}`} dark locked={busy} onClose={onLater}>
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1 }}><SideBadge side={mine} size="xl" /></View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ alignSelf: 'center', color: colors.mint, fontSize: 22, fontWeight: '800' }}>VS</Text>
      <View style={{ flex: 1 }}><SideBadge side={other} size="xl" /></View>
    </View>
    {open ? <View style={{ marginTop: 18, alignItems: 'center', gap: 2 }}>
      <Countdown until={proposal.expires_at} onElapsed={onElapsed} style={{ color: colors.mint, fontSize: 30, fontWeight: '800' }} />
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>para {athletes ? 'os atletas' : 'os representantes'} aceitarem</Text>
    </View> : null}
    <Text style={{ marginTop: 14, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18 }}>
      {open ? `Proposta de amistoso contra ${otherName}. Responda em até 2 horas.` : `Proposta contra ${otherName}.`}
    </Text>
    <View style={{ marginTop: 14, gap: 12 }}>
      {open && proposal.can_respond ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActionButton grow tone="line" title="Recusar" disabled={busy} onPress={() => void answer('recusar')} />
        <ActionButton grow tone="mint" title="Aceitar partida" disabled={busy} onPress={() => void answer('aceitar')} />
      </View> : null}
      {open && !proposal.can_respond && iAccepted ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} color={colors.mint} /><StateBadge surface="dark" tone="open">Você aceitou</StateBadge></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="hourglass" size={13} color="rgba(255,255,255,0.7)" /><StateBadge surface="dark" tone="draft">{`Aguardando ${otherName}`}</StateBadge></View>
      </View> : null}
      {open && !proposal.can_respond && !iAccepted ? <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18 }}>
        {athletes ? 'Só o atleta aceita a proposta.' : 'Só os representantes aceitam.'}
      </Text> : null}
      {proposal.state === 'combinando' ? <ActionButton block tone="mint" title="Abrir partida" onPress={() => onOpenMatch(proposal.match_id)} /> : null}
      {!open && proposal.state !== 'combinando' ? <Text accessibilityLiveRegion="polite" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18 }}>
        {proposal.state === 'recusada' ? 'A proposta foi recusada.' : 'O prazo da proposta terminou.'}
      </Text> : null}
      <View style={{ alignItems: 'center' }}>
        <TextAction surface="dark" title={open && proposal.can_respond ? 'Responder depois' : 'Fechar'} disabled={busy} onPress={onLater} />
      </View>
    </View>
  </ActionSheet>
}
