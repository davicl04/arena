import { useState } from 'react'
import { Text, View } from 'react-native'
import type { MatchDetail, MatchSlotOut, OpenSlots } from '../../api/matches'
import { footballFormat, positionShort } from '../../data/arena'
import { currentSlotCounts, guestSlots, maxSlots, shortName, sideOf, slotPositions, slotTotal } from '../../data/match'
import type { SlotCounts } from '../../data/match'
import { useNow } from '../../hooks/useNow'
import { colors } from '../../theme'
import { ActionButton, BusyStatus, ErrorText } from '../arena/controls'
import { Avatar } from '../media'
import Sheet from '../Sheet'
import { MAX_GOALKEEPER_SLOTS } from '../play/slots'
import { Stepper } from '../results/Stepper'

/**
 * Vagas para avulsos (representante): um contador por posição (no máximo um goleiro e, somando os avulsos já escalados, até o
 * formato menos um) e a lista dos avulsos escalados do meu time, cada um com "Remover" (com confirmação). Remover só vale
 * antes do início; o servidor repete as regras. O corpo de `onSave` substitui a declaração inteira do lado (posição sem vaga
 * vale 0).
 */
export function SlotsSheet({ detail, busy, error, onSave, onRemove, onClose, token }: {
  detail: MatchDetail
  busy: boolean
  /** Recusa do servidor ao formulário (`422`/`409` com conflito): as demais falhas de ação saem em toast. */
  error: string
  onSave: (slots: OpenSlots) => void
  onRemove: (slot: MatchSlotOut) => void
  onClose: () => void
  token?: string | null
}) {
  const initial = currentSlotCounts(detail)
  const guests = guestSlots(detail.slots, detail.my_side)
  const waiting = detail.slots.filter(slot => slot.side === detail.my_side && slot.state === 'oferecida').length
  const [counts, setCounts] = useState<SlotCounts>(initial)
  const [removing, setRemoving] = useState<MatchSlotOut | null>(null)
  const filledGoalkeepers = guests.filter(slot => slot.position === 'goleiro').length
  const limit = maxSlots(detail.format)
  const total = slotTotal(counts) + guests.length
  const format = detail.format ? footballFormat[detail.format] : null
  const changed = slotPositions.some(({ value }) => counts[value] !== initial[value])
  const scheduled = detail.state === 'agendada'
  const now = useNow()
  const started = detail.starts_at !== null && now >= new Date(detail.starts_at).getTime()
  const mine = sideOf(detail, detail.my_side)

  if (removing) {
    const name = removing.guest?.name ?? 'o avulso'
    return <Sheet title="Remover avulso" onClose={onClose} onBack={() => setRemoving(null)}>
      <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{name}</Text>
      <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 19 }}>
        {name} sai da partida e deixa de ver o chat. A vaga não reabre sozinha: ajuste as vagas se quiser outro avulso.
      </Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <BusyStatus text={busy ? 'Removendo o avulso…' : ''} />
      <View style={{ marginTop: 14 }}>
        <ActionButton block tone="brand" title={busy ? 'Removendo…' : 'Remover'} accessibilityLabel="Remover" busy={busy} onPress={() => onRemove(removing)} />
      </View>
    </Sheet>
  }

  return <Sheet title="Vagas para avulsos" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>{`${shortName(mine)}${format ? ` · ${format.label} ${format.size}` : ''} · até ${limit} vagas`}</Text>
    <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>
      {scheduled
        ? 'Avulsos da cidade recebem a vaga por 2 h e entram só nesta partida.'
        : 'As vagas abrem para avulsos quando a partida for agendada. O que você marcar aqui substitui as vagas informadas na busca.'}
    </Text>
    <View accessibilityLabel="Vagas por posição" style={{ marginTop: 6 }}>
      {slotPositions.map(({ value, label }) => {
        // O máximo do contador: o que ainda cabe no formato e, no goleiro, uma vaga contando o avulso já escalado.
        const room = counts[value] + Math.max(0, limit - total)
        const max = value === 'goleiro' ? Math.min(room, Math.max(0, MAX_GOALKEEPER_SLOTS - filledGoalkeepers)) : room
        return <View key={value} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}><Text style={{ fontWeight: '700' }}>{label}</Text>{`  ${positionShort[value]}`}</Text>
          <Stepper label={`Vagas de ${label}`} value={counts[value]} min={0} max={max} disabled={busy} onChange={next => setCounts(old => ({ ...old, [value]: next }))} />
        </View>
      })}
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>
      {`${total} de ${limit} vagas${guests.length ? `, contando ${guests.length} ${guests.length === 1 ? 'avulso escalado' : 'avulsos escalados'}` : ''}. No máximo uma vaga de goleiro.`}
      {waiting ? ` ${waiting} ${waiting === 1 ? 'vaga está reservada' : 'vagas estão reservadas'} para avulsos que ainda vão responder.` : ''}
    </Text>
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Salvando as vagas…' : ''} />
    <View style={{ marginTop: 12 }}>
      <ActionButton block tone="brand" title={busy ? 'Salvando…' : 'Salvar vagas'} accessibilityLabel="Salvar vagas" disabled={!changed && scheduled} busy={busy} onPress={() => onSave(counts)} />
    </View>

    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Avulsos escalados</Text>
      {guests.length === 0
        ? <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>Nenhum avulso escalado no seu time.</Text>
        : guests.map(slot => <View key={slot.id} testID="guest-row" style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar path={slot.guest?.avatar_url ?? null} name={slot.guest?.name ?? 'Avulso'} token={token ?? null} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{slot.guest?.name}</Text>
            <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{`Avulso · ${slotPositions.find(item => item.value === slot.position)?.label}`}</Text>
          </View>
          {!started ? <ActionButton tone="outline" size="sm" fit icon="user-minus" title="Remover" accessibilityLabel={`Remover ${slot.guest?.name ?? 'avulso'} da partida`} disabled={busy} onPress={() => setRemoving(slot)} /> : null}
        </View>)}
    </View>
  </Sheet>
}
