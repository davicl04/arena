import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import type { Position } from '../../api/client'
import { putAttendance } from '../../api/results'
import type { AttendanceItem, Lineup, ResultMatch } from '../../api/results'
import type { Side } from '../../api/matches'
import { footballFormat } from '../../data/arena'
import { sideName, sideOf } from '../../data/match'
import { useSessionToken } from '../../hooks/useSessionToken'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { ActionButton, ErrorText, LiveNotice } from '../arena/controls'
import { SectionTabs } from '../events/SectionTabs'
import Sheet from '../Sheet'
import { otherSide, viewSide } from './format'
import { LineupRow } from './LineupRow'
import { Muted } from './ui'

/*
 * "Revisar elenco" (R4): a folha "Quem jogou e estatísticas". A aba do meu time deixa o representante marcar quem jogou
 * (a presença vale 1 ponto e define quem entra no ranking individual) e revisar as estatísticas enviadas; a aba do
 * adversário lista os atletas dele, com "Contestar" para o representante (RN10). Quem não age pelo lado só lê.
 */
type Draft = Record<number, { present: boolean; position: Position | null }>

export function RosterSheet({ match, lineups, onLineups, onUpdated, onChanged, onClose, onExpired, notify }: {
  match: ResultMatch
  lineups: Lineup[]
  /** Troca a lista inteira (a presença devolve todos os atletas). */
  onLineups: (items: Lineup[]) => void
  /** Troca um atleta (revisão e contestação). */
  onUpdated: (lineup: Lineup) => void
  /** Avisa a tela da partida que algo mudou (permissões e pendências dependem do elenco). */
  onChanged: () => void
  onClose: () => void
  onExpired: () => void
  notify: (text: string) => void
}) {
  const mine = viewSide(match)
  const [tab, setTab] = useState<Side>(mine)
  const [notice, setNotice] = useState('')
  const token = useSessionToken()
  const own = sideOf(match, mine)
  const other = sideOf(match, otherSide(mine))
  const editing = match.permissions.attendance && tab === mine && match.my_side !== null
  const rows = lineups.filter(item => item.side === tab)
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(
    lineups.filter(item => item.side === mine).map(item => [item.user.id, { present: item.present === true, position: item.position }])))
  const { busy, error, run } = useSubmit(onExpired)

  const baseline = (lineup: Lineup) => ({ present: lineup.present === true, position: lineup.position })
  const changed = lineups.filter(item => item.side === mine && draft[item.user.id]
    && (draft[item.user.id].present !== baseline(item).present || (draft[item.user.id].present && draft[item.user.id].position !== baseline(item).position)))
  const missingPosition = changed.some(item => draft[item.user.id].present && !draft[item.user.id].position)

  // Avisos dentro da folha: a região viva da folha e o toast (que a folha mostra no próprio viewport) recebem o mesmo texto.
  // Pendência da migração dos `LiveNotice`: depois dela, só o toast fica.
  const say = useCallback((text: string) => { setNotice(text); notify(text) }, [notify])

  async function saveAttendance() {
    const athletes: AttendanceItem[] = changed.map(item => {
      const entry = draft[item.user.id]
      return entry.present ? { user_id: item.user.id, present: true, position: entry.position } : { user_id: item.user.id, present: false }
    })
    const result = await run(() => putAttendance(match.id, athletes), 'Não foi possível registrar a presença.')
    if (!result) return
    onLineups(result.items)
    setDraft(Object.fromEntries(result.items.filter(item => item.side === mine)
      .map(item => [item.user.id, { present: item.present === true, position: item.position }])))
    say('Presença registrada')
    onChanged()
  }

  const sent = rows.filter(item => item.present === true && item.stat).length
  const played = rows.filter(item => item.present === true).length
  const tabs = [
    { value: mine, label: sideName(own, 'Meu time') },
    ...(other?.team ? [{ value: otherSide(mine), label: sideName(other) }] : []),
  ]
  const format = match.format ? footballFormat[match.format] : null

  return <Sheet title="Quem jogou e estatísticas" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 4 }}>{`${sideName(own)}${format ? ` · ${format.label}` : ''}`}</Text>
    {tabs.length > 1 ? <View style={{ marginVertical: 8 }}><SectionTabs label="Elenco" items={tabs} value={tab} onChange={setTab} /></View> : null}
    <LiveNotice text={notice} />
    <Muted>{played ? `${sent} de ${played} que jogaram enviaram estatísticas.` : 'Ninguém marcado como presente ainda.'}</Muted>
    {rows.length === 0
      ? <Text style={{ marginVertical: 16, textAlign: 'center', color: colors['ink-muted'], fontSize: 12 }}>Nenhum atleta neste elenco.</Text>
      : <View accessibilityLabel="Elenco" style={{ marginTop: 4 }}>
        {rows.map(lineup => <LineupRow key={lineup.user.id} matchId={match.id} lineup={lineup} token={token} onExpired={onExpired} notify={say}
          attendance={editing ? (draft[lineup.user.id] ?? baseline(lineup)) : undefined}
          onAttendance={editing ? change => setDraft(old => ({ ...old, [lineup.user.id]: change })) : undefined}
          onUpdated={updated => { onUpdated(updated); onChanged() }} />)}
      </View>}
    {editing ? <>
      <View style={{ marginTop: 8 }}><Muted>Marque quem jogou: a presença vale 1 ponto. As estatísticas vêm de cada atleta; o adversário pode contestá-las antes de pontuar.</Muted></View>
      {missingPosition ? <ErrorText>Escolha a posição de quem jogou.</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={{ marginTop: 12 }}>
        <ActionButton tone="brand" block title={busy ? 'Salvando…' : 'Salvar presença'} accessibilityLabel="Salvar presença" busy={busy} disabled={changed.length === 0 || missingPosition} onPress={() => void saveAttendance()} />
      </View>
    </> : null}
  </Sheet>
}
