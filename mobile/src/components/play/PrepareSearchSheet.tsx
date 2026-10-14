import { useState } from 'react'
import { Text, View } from 'react-native'
import { createSearch } from '../../api/matchmaking'
import type { SearchCreated } from '../../api/matchmaking'
import type { OpenSlots } from '../../api/matches'
import { footballFormats } from '../../data/arena'
import type { FootballFormat } from '../../data/arena'
import { slotTotal } from '../../data/match'
import { reportActionError } from '../../hooks/useSubmit'
import { ActionButton, FieldError, Hint, Notice, SwitchRow } from '../arena/controls'
import { DarkEyebrow } from '../arena/TeamsPlate'
import { ActionSheet } from '../arena/ActionSheet'
import { formatChips } from './formatChips'
import { formatOptions, PlateChips } from './PlateChips'
import { emptySlots } from './slots'
import { SlotSteppers } from './SlotSteppers'

interface Problems { general: string; format: string; open_slots: string }
const none: Problems = { general: '', format: '', open_slots: '' }
const options = formatOptions(formatChips)

/**
 * Preparar busca (V2): a folha `forest` que o botão "Encontrar partida" abre no "Com meu time". Escolhe o formato e diz
 * se o time está completo; se não está, abre vagas por posição para avulsos (no máximo um goleiro e o formato menos um).
 * A busca dura 24 h. Os erros do servidor (`422 { detail, fields }`) aparecem no campo que nomeiam; as demais falhas saem
 * em toast e a folha fica aberta para tentar de novo. Só o representante chega aqui; o servidor confere de novo.
 */
export function PrepareSearchSheet({ team, eyebrow, format, onFormat, hint, onCreated, onClose, onExpired }: {
  team: { id: number; name: string }
  /** "Ferrugem FC · Prata": o time e o elo no formato. */
  eyebrow: string
  format: FootballFormat
  onFormat: (format: FootballFormat) => void
  /** "Times de Brasília Bronze, Prata ou Ouro": quem a busca encontra. */
  hint: string
  onCreated: (created: SearchCreated) => void
  onClose: () => void
  onExpired: () => void
}) {
  const [complete, setComplete] = useState(true)
  const [slots, setSlots] = useState<OpenSlots>(emptySlots)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<Problems>(none)
  const total = slotTotal(slots)
  const open = !complete
  const blocked = open && total === 0
  const formatName = footballFormats.find(item => item.value === format)?.label ?? ''

  async function submit() {
    setBusy(true)
    setProblems(none)
    try {
      const created = await createSearch({ sport: 'futebol', team_id: team.id, format, team_complete: complete, open_slots: complete ? null : slots })
      setBusy(false)
      onCreated(created)
    } catch (cause) {
      const report = reportActionError(cause, 'Não foi possível iniciar a busca.', onExpired)
      if (report.kind === 'form') {
        const next = { ...none }
        for (const field of report.fields) {
          if (field.field === 'open_slots') next.open_slots = field.message
          else if (field.field === 'format') next.format = field.message
        }
        // Recusa do servidor sem campo conhecido: fica no formulário, acima do botão.
        if (!next.open_slots && !next.format) next.general = report.message
        setProblems(next)
      }
      setBusy(false)
    }
  }

  return <ActionSheet title="Preparar busca" dark locked={busy} onClose={onClose}>
    <DarkEyebrow>{eyebrow}</DarkEyebrow>
    <View style={{ marginTop: 14, gap: 8 }}>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>Formato da partida</Text>
      <PlateChips label="Formato da partida" options={options} value={format} onChange={onFormat} disabled={busy} />
      <FieldError error={problems.format} surface="dark" />
    </View>
    <View style={{ marginTop: 14 }}>
      <SwitchRow surface="dark" separated label="O time está completo?" hint="Desligue para abrir vagas para atletas avulsos" checked={complete} disabled={busy} onChange={setComplete} />
    </View>
    {open ? <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10 }}>
      <SlotSteppers format={format} value={slots} onChange={setSlots} disabled={busy} error={problems.open_slots} />
    </View> : null}
    <Hint surface="dark">{hint}. A busca dura 24 h.{open ? ' As vagas abrem para avulsos assim que a partida for agendada.' : ''}</Hint>
    {problems.general ? <Notice surface="dark">{problems.general}</Notice> : null}
    <View style={{ marginTop: 14 }}>
      <ActionButton block tone="mint" icon="swords" busy={busy} disabled={blocked}
        title={busy ? 'Buscando…' : `Buscar adversário${open && total ? ` · ${total} ${total === 1 ? 'vaga' : 'vagas'}` : ''}`}
        accessibilityLabel="Buscar adversário" accessibilityHint={`Formato ${formatName}${open && total ? `, ${total} ${total === 1 ? 'vaga' : 'vagas'} para avulsos` : ', time completo'}`}
        onPress={() => void submit()} />
    </View>
    {blocked ? <Text style={{ marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>Abra ao menos uma vaga ou marque o time como completo.</Text> : null}
  </ActionSheet>
}
