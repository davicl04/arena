import type { Sport } from '../../api/client'
import type { MatchSearch, Proposal, SlotOffer } from '../../api/matchmaking'
import { footballFormat, positionOptions } from '../../data/arena'
import { slotsSummary } from './slots'
import type { AvulsoPosition } from './tierLines'

/*
 * Textos e estados da placa do Jogar (porta do miolo de `web/src/pages/PlayPage.tsx`): a linha de apoio da busca e a
 * máquina do botão redondo. São funções puras; a tela só liga cada ação ao seu efeito.
 */

/** Futebol: jogar com um time que o titular representa ou avulso, ocupando a vaga de outro time. */
export type PlayMode = 'time' | 'avulso'

const lower = (value: string) => value.toLocaleLowerCase('pt-BR')

/** Quem a busca encontra, para a linha de apoio da placa e da folha ("Times de Brasília Bronze, Prata ou Ouro"). */
export function searchHint(sport: Sport, mode: PlayMode, city: string, position: AvulsoPosition, levels: string): string {
  const anyLevel = levels === 'qualquer nível'
  if (sport === 'tenis') return `Tenistas de ${city} ${anyLevel ? 'de qualquer nível' : levels}`
  if (mode === 'avulso') {
    const label = positionOptions.find(option => option.value === position)?.label
    const where = label ? `Vagas de ${lower(label)} em partidas de ${city}` : `Vagas em partidas de ${city}`
    return anyLevel ? where : `${where} (${levels})`
  }
  return `Times de ${city} ${anyLevel ? 'de qualquer nível' : levels}`
}

/** O que o toque no botão redondo faz. */
export type PlateAction = 'prepare' | 'teams' | 'start' | 'cancel' | 'held'

export interface PlateButtonState {
  /** Verbo em caixa alta ("ENCONTRAR", "BUSCANDO", "RESPONDER"). */
  verb: string
  /** Complemento sob o verbo ("partida", "vaga"); durante a busca, o tempo decorrido ocupa o lugar. */
  caption: string
  /** Nome acessível do botão. */
  label: string
  /** `null`: o botão fica desabilitado e a nota explica o motivo. */
  action: PlateAction | null
  /** Início da busca em andamento (`started_at`), que liga o cronômetro. */
  since: string | null
  /** Linha sob o botão: o que ele faz agora ou por que está parado. */
  note: string
}

export interface PlateButtonInput {
  sport: Sport
  mode: PlayMode
  /** "Futebol", "Tênis"... */
  sportLabel: string
  profilesLoading: boolean
  profilesFailed: boolean
  hasProfile: boolean
  /** Futebol "Com meu time". */
  timeMode: boolean
  standingsLoaded: boolean
  standingsLoading: boolean
  /** O titular representa um time. */
  hasTeam: boolean
  boardLoaded: boolean
  boardLoading: boolean
  /** A busca aberta do contexto (modalidade, chave e time escolhidos). */
  search: MatchSearch | undefined
  heldProposal: Proposal | undefined
  heldOffer: SlotOffer | undefined
  /** `searchHint` do contexto. */
  hint: string
  starting: boolean
}

/**
 * Estado do botão: preparar o perfil, criar ou representar um time, buscar, esperar ou responder. A corrida com perfil
 * não usa o botão (o registro é da área da corrida): devolve `null`.
 */
export function plateButton(input: PlateButtonInput): PlateButtonState | null {
  const { sport, search, heldProposal, heldOffer } = input
  const corrida = sport === 'corrida'
  const caption = corrida ? 'treino ou prova' : sport === 'futebol' && input.mode === 'avulso' ? 'vaga' : 'partida'
  const idle: PlateButtonState = {
    verb: 'ENCONTRAR', caption, label: `Encontrar ${caption}`, action: null, since: null, note: '',
  }
  if (input.profilesLoading) return { ...idle, note: 'Carregando suas modalidades…' }
  if (input.profilesFailed) return { ...idle, note: 'Não foi possível carregar suas modalidades.' }
  if (!input.hasProfile) {
    return {
      verb: 'PREPARAR', caption: 'seu perfil', label: `Preparar perfil de ${input.sportLabel}`, action: 'prepare', since: null,
      note: corrida
        ? 'Prepare seu perfil de corrida: o Arena usa a sua cidade para mostrar as provas perto de você.'
        : `Prepare seu perfil de ${input.sportLabel.toLocaleLowerCase('pt-BR')}: o Arena usa a sua cidade para encontrar partidas perto de você.`,
    }
  }
  if (input.timeMode && input.standingsLoaded && !input.hasTeam) {
    return {
      verb: 'MEU TIME', caption: 'crie ou represente', label: 'Crie ou represente um time', action: 'teams', since: null,
      note: 'Só quem representa um time busca amistosos entre times. Sem time, você ainda pode jogar avulso.',
    }
  }
  if (corrida) return null
  if (search?.state === 'ativa') {
    const format = search.format ? ` · ${footballFormat[search.format]?.label ?? ''}` : ''
    const slots = search.kind === 'time' ? ` ${slotsSummary(search.open_slots)}.` : ''
    return {
      verb: 'BUSCANDO', caption: '', label: 'Buscando. Toque para cancelar a busca', action: search.can_cancel ? 'cancel' : null,
      since: search.started_at, note: `${input.hint}${format}.${slots}`,
    }
  }
  if (search?.state === 'pareada' && heldProposal && !heldProposal.can_respond) {
    return {
      verb: 'AGUARDANDO', caption: 'o adversário', label: 'Ver a proposta, que aguarda o adversário', action: 'held', since: null,
      note: 'Você aceitou a proposta. Falta o adversário responder, em até 2 h.',
    }
  }
  if (search?.state === 'pareada') {
    return {
      verb: 'RESPONDER', caption: heldOffer ? 'oferta de vaga' : 'proposta', label: heldOffer ? 'Responder à oferta de vaga' : 'Responder à proposta',
      action: heldProposal || heldOffer ? 'held' : null, since: null,
      note: heldOffer ? 'Uma vaga foi reservada para você. Responda em até 2 h.' : 'Encontramos um adversário. Os dois lados têm até 2 h para aceitar.',
    }
  }
  if (input.timeMode && !input.standingsLoaded) {
    return { ...idle, note: input.standingsLoading ? 'Carregando seus times…' : 'Não foi possível carregar seus times. Tente novamente.' }
  }
  if (!input.boardLoaded) {
    return { ...idle, note: input.boardLoading ? 'Carregando a placa…' : 'Não foi possível carregar a placa do Jogar. Tente novamente.' }
  }
  return { ...idle, action: input.starting ? null : 'start', note: input.starting ? 'Iniciando a busca…' : `${input.hint}.` }
}
