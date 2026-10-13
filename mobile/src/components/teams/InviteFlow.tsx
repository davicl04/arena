import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { getTeam, inviteCandidatesPath, sendInvite } from '../../api/teams'
import type { InviteCandidate, TeamStatus } from '../../api/teams'
import { usePagedList } from '../../hooks/usePagedList'
import { useResource } from '../../hooks/useResource'
import { useSubmit } from '../../hooks/useSubmit'
import { useAndroidBack } from '../../navigation/useNavigation'
import { colors } from '../../theme'
import { MemberFace } from './MemberFace'
import { GroupLabel, TeamIdCard } from './TeamIdCard'
import { DarkTopBar } from '../arena/TeamsPlate'
import { ActionButton, Notice, TextAction } from '../arena/controls'
import { StepBars } from '../arena/StepBars'
import { onDark } from './ui'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

// O gerador de QR (react-native-qrcode-svg) só é carregado quando a aba Link e QR abre.
const TeamLinkPanel = lazy(() => import('./TeamLinkPanel').then(module => ({ default: module.TeamLinkPanel })))

export type InviteTab = 'pessoa' | 'link'
export const MESSAGE_MAX = 140
/** Espera depois da última tecla antes de buscar (a mesma da busca de atletas da Comunidade). */
export const SEARCH_DELAY_MS = 300
const tabs: readonly { value: InviteTab; label: string; icon: IconName }[] = [
  { value: 'pessoa', label: 'Escolher atleta', icon: 'user-plus' },
  { value: 'link', label: 'Link e QR', icon: 'qr-code' },
]
const statusLabel: Record<Exclude<TeamStatus, 'disponivel'>, string> = { membro: 'No elenco', convite_pendente: 'Pendente', pedido_pendente: 'Pendente' }

/** Linha do candidato sobre o escuro: "No elenco", "Pendente" ou "Escolher". */
function CandidateRow({ candidate, last, onChoose }: { candidate: InviteCandidate; last: boolean; onChoose: () => void }) {
  const { person, team_status: status } = candidate
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
    <MemberFace name={person.name} avatarUrl={person.avatar_url} size="row" />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>{person.name}</Text>
      <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.56)', fontSize: 10.5 }}>@{person.username}</Text>
    </View>
    {status === 'disponivel'
      ? <TextAction surface="dark" title="Escolher" accessibilityLabel={`Escolher ${person.name}`} onPress={onChoose} />
      : <Text accessibilityLabel={`${person.name}: ${statusLabel[status]}`} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontWeight: '700' }}>{statusLabel[status]}</Text>}
  </View>
}

/**
 * Convidar (I5 + Q2 + Q5), tela `team-invite`. Passo 1: abas Escolher atleta | Link e QR; a busca (nome ou @, espera de
 * 300 ms) parte de quem você segue. Passo 2: a carteirinha como o convidado vai ver e a mensagem opcional (até 140).
 * Depois de enviar, volta ao passo 1 com o aviso, para convidar mais gente. A aba Link e QR é o `TeamLinkPanel`.
 */
export function InviteFlow({ teamId, initialTab = 'pessoa', onClose, onExpired }: { teamId: number; initialTab?: InviteTab; onClose: () => void; onExpired: () => void }) {
  const { data: team, error: loadError } = useResource(useCallback(() => getTeam(teamId), [teamId]), onExpired, { fallback: 'Não foi possível carregar o time.' })
  const [tab, setTab] = useState<InviteTab>(initialTab)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<InviteCandidate | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const send = useSubmit(onExpired)
  const candidates = usePagedList<InviteCandidate>(inviteCandidatesPath(teamId, search), onExpired)
  const { setError: clearSendError } = send

  // Busca com espera curta enquanto se digita; o teclado (buscar) busca na hora.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])
  const backToList = useCallback(() => { clearSendError(''); setChosen(null) }, [clearSendError])
  // No passo 2, o botão do Android volta ao passo 1 em vez de sair da tela.
  useAndroidBack(chosen !== null, backToList)

  async function submitInvite() {
    if (!chosen) return
    const text = message.trim()
    const sent = await send.run(() => sendInvite(teamId, chosen.person.id, text || null), 'Não foi possível enviar o convite.')
    if (!sent) return
    candidates.setItems(items => items.map(item => item.person.id === chosen.person.id ? { ...item, team_status: 'convite_pendente' } : item))
    setNotice(`Convite enviado para ${chosen.person.name}.`)
    setChosen(null); setMessage('')
  }

  if (chosen) {
    const firstName = chosen.person.name.trim().split(/\s+/)[0]
    return <><DarkTopBar eyebrow="Passo 2 de 2" title="Revisar convite" backLabel="Voltar para escolher atleta" onBack={backToList} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
      <StepBars done={2} total={2} />
      <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, backgroundColor: onDark.card, padding: 11 }}>
        <MemberFace name={chosen.person.name} avatarUrl={chosen.person.avatar_url} size="row" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{chosen.person.name}</Text>
          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.62)', fontSize: 10.5 }}>@{chosen.person.username}</Text>
        </View>
      </View>
      <GroupLabel>{`Como ${firstName} vai ver`}</GroupLabel>
      {team
        ? <View accessible accessibilityRole="image" accessibilityLabel={`Carteirinha do ${team.name} com o selo Convite e os botões Aceitar e Recusar. Prévia do convite.`}>
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <TeamIdCard team={{ ...team, my_role: null }} highlight badge="Convite" line="Você, representante, convidou" showRoster={false}
              actions={<>
                <ActionButton tone="mint" grow icon="check" title="Aceitar" disabled onPress={() => undefined} />
                <ActionButton grow tone="line" title="Recusar" disabled onPress={() => undefined} />
              </>} />
          </View>
        </View>
        : <Text accessibilityLiveRegion="polite" style={{ color: onDark.soft, fontSize: 12 }}>{loadError || 'Carregando o time…'}</Text>}
      <GroupLabel>Mensagem (opcional)</GroupLabel>
      <TextInput accessibilityLabel="Mensagem (opcional)" value={message} onChangeText={setMessage} maxLength={MESSAGE_MAX} multiline editable={!send.busy}
        placeholder="Ex.: jogamos society às quintas, 20h, no Sudoeste." placeholderTextColor="rgba(255,255,255,0.44)" textAlignVertical="top"
        style={{ minHeight: 84, borderRadius: 8, borderWidth: 1, borderColor: onDark.line, backgroundColor: onDark.card, paddingHorizontal: 12, paddingVertical: 11, color: '#ffffff', fontSize: 14, lineHeight: 21 }} />
      <Text accessibilityLabel={`${message.length} de ${MESSAGE_MAX} caracteres`} style={{ marginTop: 4, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{message.length}/{MESSAGE_MAX}</Text>
      {send.error ? <Notice surface="dark" tone="error">{send.error}</Notice> : null}
      <View style={{ marginTop: 14 }}>
        <ActionButton tone="mint" block icon="send-horizontal" title={send.busy ? 'Enviando…' : 'Enviar convite'} accessibilityLabel={send.busy ? 'Enviando convite' : 'Enviar convite'} disabled={send.busy} onPress={() => void submitInvite()} />
      </View>
    </ScrollView></>
  }

  return <><DarkTopBar eyebrow="Passo 1 de 2" title="Quem você quer convidar?" icon="close" onBack={onClose} />
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
    <StepBars done={1} total={2} />
    {team ? <Text numberOfLines={1} style={{ marginTop: 8, color: 'rgba(255,255,255,0.56)', fontSize: 10.5 }}>Para o {team.name}</Text> : null}
    <View accessibilityRole="tablist" accessibilityLabel="Como convidar" style={{ marginTop: 12, flexDirection: 'row', gap: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', padding: 3 }}>
      {tabs.map(item => {
        const on = tab === item.value
        return <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: on }} onPress={() => setTab(item.value)}
          style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, backgroundColor: on ? colors.mint : 'transparent' }}>
          <Icon name={item.icon} size={16} color={on ? colors.night : '#ffffff'} />
          <Text style={{ color: on ? colors.night : '#ffffff', fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
        </Pressable>
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={notice ? { marginTop: 12, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8, fontSize: 11.5, lineHeight: 17, color: '#c9f2db', backgroundColor: 'rgba(143,224,180,0.12)' } : { height: 0 }}>{notice}</Text>
    {tab === 'link'
      ? <Suspense fallback={<Text accessibilityLiveRegion="polite" style={{ paddingVertical: 40, textAlign: 'center', color: onDark.soft, fontSize: 12 }}>Carregando o link do time…</Text>}>
        <TeamLinkPanel teamId={teamId} teamName={team?.name ?? 'time'} onExpired={onExpired} />
      </Suspense>
      : <View>
        <View style={{ marginTop: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: onDark.line, backgroundColor: onDark.field, paddingLeft: 12 }}>
          <Icon name="search" size={17} color="rgba(255,255,255,0.62)" />
          <TextInput accessibilityLabel="Buscar atleta por nome ou @usuário" value={query} onChangeText={setQuery} onSubmitEditing={() => setSearch(query.trim())}
            returnKeyType="search" autoCapitalize="none" autoCorrect={false} maxLength={100} placeholder="Nome ou @usuário" placeholderTextColor="rgba(255,255,255,0.5)"
            style={{ flex: 1, minHeight: 44, paddingHorizontal: 10, color: '#ffffff', fontSize: 14 }} />
        </View>
        <GroupLabel color="rgba(255,255,255,0.56)">{search ? 'Resultados' : 'Quem você segue'}</GroupLabel>
        {candidates.loading ? <View accessibilityLabel="Carregando atletas" style={{ paddingVertical: 14, alignItems: 'center' }}><ActivityIndicator color={colors.mint} /></View>
          : candidates.error ? <View>
            <Notice surface="dark" tone="error">{candidates.error.message}</Notice>
            <ActionButton tone="line" title="Tentar novamente" onPress={candidates.reload} fit />
          </View>
          : candidates.items.length === 0
            ? <Text style={{ paddingVertical: 14, color: onDark.soft, fontSize: 11.5, lineHeight: 17 }}>{search ? 'Ninguém com esse nome ou @usuário.' : 'Você ainda não segue ninguém aqui. Busque pelo nome ou @usuário.'}</Text>
            : <View accessibilityLabel={search ? 'Resultados da busca' : 'Quem você segue'}>
              {candidates.items.map((candidate, index) => <CandidateRow key={candidate.person.id} candidate={candidate} last={index === candidates.items.length - 1}
                onChoose={() => { setNotice(''); clearSendError(''); setChosen(candidate) }} />)}
            </View>}
        {candidates.moreError ? <Notice surface="dark" tone="error">{candidates.moreError}</Notice> : null}
        {candidates.hasMore ? <View style={{ marginTop: 12 }}>
          <ActionButton tone="line" title={candidates.busy ? 'Carregando…' : 'Carregar mais atletas'} disabled={candidates.busy} onPress={() => void candidates.loadMore()} fit />
        </View> : null}
      </View>}
  </ScrollView></>
}
