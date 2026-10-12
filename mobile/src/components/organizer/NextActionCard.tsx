import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { OrganizerEventDetail } from '../../api/events'
import { sentence } from '../../api/organizer'
import { colors } from '../../theme'
import { formatDeadline, plural } from '../../utils/format'
import { shortDate } from '../../utils/relativeTime'
import { ActionButton, TextAction } from '../arena/controls'
import { CHECKLIST_STEP } from './eventForm'
import { entrantsUnit, eventRefusalText } from './eventView'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

type Tone = 'now' | 'wait' | 'bad' | 'calm'
const toneLook: Record<Tone, { bg: string; icon: string; ring: boolean }> = {
  now: { bg: '#ffffff', icon: colors.brand, ring: true },
  wait: { bg: colors['warning-bg'], icon: colors.warning, ring: false },
  bad: { bg: '#fff0f2', icon: colors.danger, ring: false },
  calm: { bg: '#ffffff', icon: colors.brand, ring: false },
}

/** Cartão "Agora" (`.nowc` e `.banner` do G3): ícone, título, texto, conteúdo extra e ações. */
function NowCard({ tone, icon, title, children, extra, actions }: { tone: Tone; icon: IconName; title: string; children?: ReactNode; extra?: ReactNode; actions?: ReactNode }) {
  const look = toneLook[tone]
  return <View testID="next-action" accessibilityLabel={`Agora: ${title}`} style={{ borderRadius: 16, padding: 14, backgroundColor: look.bg, borderWidth: look.ring ? 1.5 : 0, borderColor: colors.mint }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ marginTop: 1 }}><Icon name={icon} size={22} color={look.icon} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontWeight: '800', letterSpacing: 1 }}>AGORA</Text>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 }}>{title}</Text>
        {children ? <Text style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>{children}</Text> : null}
      </View>
    </View>
    {extra}
    {actions ? <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{actions}</View> : null}
  </View>
}

/** Checklist do rascunho: cada item com o que falta e "Preencher" (abre o assistente no passo do item). */
function Checklist({ detail, onFill }: { detail: OrganizerEventDetail; onFill: (step: number) => void }) {
  return <View accessibilityLabel="Checklist do rascunho" style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.subtle, paddingHorizontal: 12 }}>
    {detail.checklist.map((item, index) => <View key={item.key} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
      <Icon name={item.done ? 'circle-check' : 'circle-dashed'} size={17} color={item.done ? colors.brand : colors['ink-muted']} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }} accessibilityLabel={`${item.label}: ${item.done ? 'completo' : 'falta'}`}>{item.label}</Text>
        {!item.done && item.message ? <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{item.message}</Text> : null}
      </View>
      {!item.done ? <TextAction title="Preencher" accessibilityLabel={`Preencher ${item.label.toLowerCase()}`} onPress={() => onFill(CHECKLIST_STEP[item.key])} /> : null}
    </View>)}
  </View>
}

export interface NextActionCardProps {
  detail: OrganizerEventDetail
  /** Ação em curso (publicar ou retirar). */
  busy: boolean
  onSubmit: () => void
  onWithdraw: () => void
  /** Abre o assistente no passo indicado (rascunho). */
  onFill: (step?: number) => void
  /** Abre Comprovantes e devoluções (tela `event-receipts`). */
  onReceipts: () => void
  onShowEntries: () => void
  /** Abre o chaveamento ou a tabela do campeonato (tela `event-bracket`). */
  onBracket?: () => void
  /** Abre a lista de partidas do campeonato (tela `event-matches`). */
  onMatches?: () => void
}

/**
 * Próxima ação do organizador (G3), vinda de `next_action` da API: completar o rascunho (checklist e "Publicar"
 * desabilitado até completar), publicar ou enviar à aprovação, aguardar a administração (com "Retirar da aprovação"),
 * corrigir a recusa, analisar comprovantes, enviar devoluções, acompanhar as inscrições e, no campeonato, sortear e confirmar
 * o chaveamento, agendar e decidir as partidas, e assim por diante.
 */
export function NextActionCard({ detail, busy, onSubmit, onWithdraw, onFill, onReceipts, onShowEntries, onBracket, onMatches }: NextActionCardProps) {
  const action = detail.next_action
  const paid = Boolean(detail.price_cents)
  const submitLabel = paid ? 'Enviar para aprovação' : 'Publicar'
  const count = action.count ?? 0
  const roundRobin = detail.competition_type === 'todos_contra_todos'
  const tree = roundRobin ? 'a tabela' : 'o chaveamento'
  const open = (handler?: () => void) => handler ?? (() => undefined)
  const missing = detail.checklist.filter(item => !item.done).length
  const submit = <ActionButton tone="brand" icon="send" title={busy ? (paid ? 'Enviando…' : 'Publicando…') : submitLabel} accessibilityLabel={submitLabel}
    disabled={!detail.can_submit} busy={busy} onPress={onSubmit} accessibilityHint={detail.can_submit ? undefined : 'Complete os itens que faltam para liberar.'} />
  const submitHint = <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>
    {detail.can_submit ? '' : 'Complete os itens que faltam para liberar. '}Evento gratuito publica direto; pago vai para a aprovação da administração.
  </Text>

  switch (action.kind) {
    case 'aguardar_revogacao':
      return <NowCard tone="wait" icon="shield-alert" title="A administração decide se o evento segue">
        Sua permissão de organizador foi revogada. As inscrições ficam suspensas e a gestão fica só de leitura até a decisão.
      </NowCard>
    case 'corrigir_recusa':
      return <NowCard tone="bad" icon="circle-x" title="Recusado pela administração"
        extra={missing > 0 ? <Checklist detail={detail} onFill={onFill} /> : undefined}
        actions={<ActionButton tone="brand" icon="file-pen" title="Corrigir e reenviar" onPress={() => onFill()} />}>
        {detail.refusal ? `Motivo: ${sentence(eventRefusalText(detail.refusal.reason_code, detail.refusal.reason_detail))}` : 'Revise os dados.'} Corrija e envie de novo para aprovação.
      </NowCard>
    case 'completar_rascunho':
      return <NowCard tone="now" icon="file-pen" title="Complete o rascunho"
        extra={<><Checklist detail={detail} onFill={onFill} />{submitHint}</>} actions={submit}>
        {missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`} para {paid ? 'enviar à aprovação' : 'publicar'}.
      </NowCard>
    case 'publicar':
      return <NowCard tone="now" icon="circle-check" title={paid ? 'Pronto para enviar à aprovação' : 'Pronto para publicar'} extra={submitHint}
        actions={<>{submit}<ActionButton tone="outline" icon="file-pen" title="Revisar dados" onPress={() => onFill()} /></>}>
        Todos os itens do checklist estão completos.
      </NowCard>
    case 'aguardar_aprovacao':
      return <NowCard tone="wait" icon="hourglass" title="Em aprovação pela administração"
        actions={<ActionButton tone="outline" title={busy ? 'Retirando…' : 'Retirar da aprovação'} accessibilityLabel="Retirar da aprovação" busy={busy} onPress={onWithdraw} />}>
        {detail.submitted_at ? `Enviado em ${shortDate(detail.submitted_at)}. ` : ''}Eventos pagos só são publicados depois da conferência. Você recebe a resposta nas notificações. Para editar, retire da aprovação.
      </NowCard>
    case 'analisar_comprovantes':
      return <NowCard tone="now" icon="receipt" title={`${plural(count, 'comprovante', 'comprovantes')} para analisar`}
        actions={<ActionButton tone="brand" title="Analisar" accessibilityLabel="Analisar comprovantes" onPress={onReceipts} />}>
        {detail.registration_deadline ? `Inscrições fecham ${formatDeadline(detail.registration_deadline)}.` : 'Confira valor e favorecido antes de aprovar.'}
      </NowCard>
    case 'enviar_devolucoes':
      return <NowCard tone="now" icon="undo" title={`${plural(count, 'devolução', 'devoluções')} para enviar`}
        actions={<ActionButton tone="brand" title="Enviar devoluções" onPress={onReceipts} />}>
        Devolva o valor por Pix e anexe o comprovante de cada devolução.
      </NowCard>
    case 'aguardar_devolucoes':
      return <NowCard tone="calm" icon="hourglass" title={`${plural(count, 'devolução aguardando', 'devoluções aguardando')} os participantes`}
        actions={<ActionButton tone="outline" title="Ver devoluções" onPress={onReceipts} />}>
        Sem resposta em 7 dias, a devolução conta como recebida. Uma contestação vai para a administração.
      </NowCard>
    case 'acompanhar_inscricoes':
      return <NowCard tone="now" icon="users" title={`Inscrições abertas até ${formatDeadline(action.deadline)}`}
        actions={<ActionButton tone="outline" title="Ver inscritos" onPress={onShowEntries} />}>
        {detail.capacity ? `${detail.entries_count} de ${detail.capacity} ${entrantsUnit(detail.sport)}` : ''}{paid ? ' · os comprovantes chegam para você analisar.' : '.'}
      </NowCard>
    case 'sortear_chaveamento':
      return <NowCard tone="now" icon="shuffle" title={roundRobin ? 'Sorteie as rodadas' : 'Sorteie o chaveamento'}
        actions={<ActionButton tone="brand" icon="shuffle" title={roundRobin ? 'Sortear rodadas' : 'Sortear chaveamento'} onPress={open(onBracket)} />}>
        {plural(count, 'inscrição confirmada', 'inscrições confirmadas')}. Depois do sorteio você confere {tree} e confirma para os {entrantsUnit(detail.sport)} verem.
      </NowCard>
    case 'confirmar_chaveamento':
      return <NowCard tone="now" icon="fork" title={roundRobin ? 'Confirme a tabela' : 'Confirme o chaveamento'}
        actions={<ActionButton tone="brand" icon="circle-check" title="Revisar e confirmar" onPress={open(onBracket)} />}>
        O sorteio está feito: só você vê {tree}. Troque os lugares, se quiser, e confirme para criar as partidas.
      </NowCard>
    case 'decidir_divergencias':
      return <NowCard tone="bad" icon="git-compare-arrows" title={`${plural(count, 'partida', 'partidas')} para decidir`}
        actions={<ActionButton tone="brand" icon="git-compare-arrows" title="Decidir" onPress={open(onMatches)} />}>
        Os placares não batem ou o prazo de 48 h passou sem resultado. Você decide, com uma justificativa que os dois times veem.
      </NowCard>
    case 'agendar_partidas':
      return <NowCard tone="now" icon="calendar-days" title={`${plural(count, 'partida', 'partidas')} para agendar`}
        actions={<ActionButton tone="brand" icon="calendar-days" title="Agendar" onPress={open(onMatches)} />}>
        Escolha data, horário e quadra de cada jogo. Os dois elencos são avisados.
      </NowCard>
    case 'acompanhar_partidas':
      return <NowCard tone="calm" icon="calendar-days" title={count ? plural(count, 'partida agendada', 'partidas agendadas') : 'Partidas em andamento'}
        actions={<ActionButton tone="outline" title="Ver partidas" onPress={open(onMatches)} />}>
        {count ? 'Os times informam o placar depois do jogo; você decide se os placares não baterem.' : 'Os jogos que faltam esperam o resultado dos anteriores.'}
      </NowCard>
    case 'aguardar_inicio':
      return <NowCard tone="calm" icon="flag" title={`Inscrições encerradas · começa ${formatDeadline(action.deadline)}`}>
        {detail.sport === 'corrida' ? 'Acompanhe os inscritos até o dia da prova.' : 'Com pelo menos 2 inscrições confirmadas, você pode sortear o chaveamento.'}
      </NowCard>
    default:
      if (detail.state === 'cancelado')
        return <NowCard tone="bad" icon="circle-x" title="Evento cancelado">
          {detail.cancel_reason ? `Motivo: ${detail.cancel_reason}` : 'Os inscritos foram avisados.'}
        </NowCard>
      return <NowCard tone="calm" icon="circle-check" title={detail.state === 'encerrado' ? 'Evento encerrado' : detail.state === 'em_andamento' ? 'Evento em andamento' : 'Nada pendente'}>
        Nada pendente por aqui.
      </NowCard>
  }
}
