import type { MatchCard, MatchSideOut } from '../api/matches'
import { orderedSides, sideName } from './match'

/*
 * Regras e textos do Início (spec "Nova tela de Início"): a Contagem do Placar, o rótulo dos lados ("Você"), o texto do
 * Placar vazio e o rótulo do botão principal. A web aplica as mesmas regras e os mesmos textos.
 */

const MINUTE = 60_000
const HOUR_MINUTES = 60
const DAY_MINUTES = 24 * HOUR_MINUTES

/** Um número da Contagem com a unidade ("3" e "dias"). */
export interface CountdownPart {
  value: number
  unit: string
}

/**
 * Contagem até a partida, em minutos inteiros (arredondados para baixo):
 * - a partir de 24 h, "{d} dia(s) {h} h", com "1 dia" no singular e as horas sempre presentes, inclusive "0 h";
 * - de 1 h a 24 h, "{h} h {m} min";
 * - abaixo de 1 h, "{m} min", no mínimo "1 min" (a partida que já começou não é mais a próxima).
 */
export function countdownParts(ms: number): CountdownPart[] {
  const minutes = Math.max(1, Math.floor((Number.isFinite(ms) ? ms : 0) / MINUTE))
  if (minutes >= DAY_MINUTES) {
    const days = Math.floor(minutes / DAY_MINUTES)
    return [{ value: days, unit: days === 1 ? 'dia' : 'dias' }, { value: Math.floor((minutes % DAY_MINUTES) / HOUR_MINUTES), unit: 'h' }]
  }
  if (minutes >= HOUR_MINUTES) return [{ value: Math.floor(minutes / HOUR_MINUTES), unit: 'h' }, { value: minutes % HOUR_MINUTES, unit: 'min' }]
  return [{ value: minutes, unit: 'min' }]
}

/** A Contagem em texto: "3 dias 4 h", "5 h 20 min" ou "40 min". */
export const countdownText = (ms: number): string => countdownParts(ms).map(part => `${part.value} ${part.unit}`).join(' ')

/** Nome do lado no Placar: em partida individual (lado de atleta), o lado do titular (`my_side`) é "Você". */
export function sideLabel(card: Pick<MatchCard, 'my_side'>, side: MatchSideOut | undefined): string {
  if (side && side.kind === 'atleta' && side.side === card.my_side) return 'Você'
  return sideName(side)
}

/** Linha do confronto, com o lado do titular primeiro: "Ferrugem FC × Leões do Cerrado" ou "Você × Rafael Lima". */
export function matchupLabel(card: Pick<MatchCard, 'sides' | 'my_side'>): string {
  const [first, second] = orderedSides(card)
  return `${sideLabel(card, first)} × ${second ? sideLabel(card, second) : 'adversário a definir'}`
}

/** Texto do Placar sem partida agendada: o convite muda para quem ainda não tem nenhum perfil esportivo. */
export const emptyPlacarText = (hasProfiles: boolean): string =>
  hasProfiles ? 'Que tal marcar a próxima?' : 'Prepare seus perfis esportivos e encontre a primeira.'

/** Rótulo do botão principal do Início, que sempre abre o Jogar. */
export function primaryButtonLabel({ hasProfiles, hasNextMatch }: { hasProfiles: boolean; hasNextMatch: boolean }): string {
  if (!hasProfiles) return 'Preparar perfis'
  return hasNextMatch ? 'Encontrar outra partida' : 'Encontrar partida'
}
