import { useCallback, useEffect, useId, useState } from 'react'
import type { ReactElement } from 'react'
import type { RunCreated } from '../../api/runs'
import type { RunDistance } from '../../data/arena'
import type { useRunBests } from '../../hooks/useRunBests'
import type { Navigation } from '../../navigation/useNavigation'
import { toast } from '../toast/toastStore'
import { RunEntrySheet } from './RunEntrySheet'
import { savedNotice } from './RunSavedCard'

/**
 * Propriedades das duas partes da corrida na tela Jogar (as mesmas do `RunArea`, menos o `part`). A tela entrega a
 * distância escolhida nos chips, as marcas de `GET /me/run-bests` (lidas uma vez, na tela) e a navegação.
 */
export interface RunPartProps {
  /** Distância escolhida nos chips da placa (a mesma do `TierLine`): o registro da placa abre nela. */
  distance: RunDistance
  onDistance: (distance: RunDistance) => void
  /** Marcas de `GET /me/run-bests`: depois de salvar ou remover, `refresh` as relê no lugar, sem limpar a tela. */
  bests: ReturnType<typeof useRunBests>
  navigation: Navigation
  onExpired: () => void
}

/* O último cartão de "marca salva" vence: salvar (ou remover) numa das partes limpa o aviso da outra. */
const parts = new Map<string, () => void>()
const clearOthers = (except?: string) => parts.forEach((clear, id) => { if (id !== except) clear() })

/**
 * O registro de corrida de uma parte da tela (K2): abre a tela cheia na distância pedida, grava, mostra o cartão de salvo
 * e o toast de confirmação, e relê as marcas. Cada parte (`RunPlateActions` na placa e `RunMarksSection` abaixo
 * dela) usa a sua própria instância, sem provedor: só uma folha fica aberta por vez, e o cartão aparece onde a ação começou.
 */
export function useRunEntry({ bests, navigation, onExpired }: Pick<RunPartProps, 'bests' | 'navigation' | 'onExpired'>) {
  const id = useId()
  const [entry, setEntry] = useState<RunDistance | null>(null)
  const [saved, setSaved] = useState<RunCreated | null>(null)
  const { refresh } = bests

  const dismiss = useCallback(() => setSaved(null), [])
  useEffect(() => {
    parts.set(id, dismiss)
    return () => { parts.delete(id) }
  }, [id, dismiss])

  const done = (created: RunCreated) => {
    clearOthers(id)
    setEntry(null)
    setSaved(created)
    toast.success(savedNotice(created))
    void refresh()
  }
  /** Uma marca foi removida do histórico: os cartões de salvo ficam desatualizados e as marcas são relidas. */
  const removed = () => {
    clearOthers()
    void refresh()
  }
  const sheet: ReactElement | null = entry === null ? null
    : <RunEntrySheet initialDistance={entry} onClose={() => setEntry(null)} onSaved={done} onExpired={onExpired}
      onFindRaces={() => { setEntry(null); navigation.go('events', { sport: 'corrida' }) }} />

  return { open: setEntry, sheet, saved, dismiss, removed }
}
