import type { MatchCard, MatchSideOut } from '@/api/matches'
import { orderedSides, sideName } from '@/data/match'

/*
 * Regras puras do Início (Placar e botão principal). O Início do Expo segue as mesmas regras e textos, com funções de
 * mesmos nomes: mudar uma regra aqui exige mudar lá também.
 */

const MINUTE = 60_000

/** Um número da Contagem com a unidade ao lado: `{ value: 3, unit: 'dias' }`. */
export interface CountdownPart {
  value: number
  unit: string
}

/**
 * Partes da Contagem até a partida, por faixa: a partir de 24 h, dias e horas ("1 dia 0 h"); de 1 h a 24 h, horas e
 * minutos; abaixo de 1 h, só os minutos, no mínimo 1. Minutos arredondados para baixo; zero, negativo ou inválido: "1 min".
 */
export function countdownParts(ms: number): CountdownPart[] {
  const minutes = Number.isFinite(ms) ? Math.max(1, Math.floor(ms / MINUTE)) : 1
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days >= 1) return [{ value: days, unit: days === 1 ? 'dia' : 'dias' }, { value: hours, unit: 'h' }]
  if (hours >= 1) return [{ value: hours, unit: 'h' }, { value: minutes % 60, unit: 'min' }]
  return [{ value: minutes, unit: 'min' }]
}

/** Contagem em texto: "3 dias 4 h", "5 h 12 min" ou "8 min". */
export function countdownText(ms: number): string {
  return countdownParts(ms).map(part => `${part.value} ${part.unit}`).join(' ')
}

const spokenUnits: Record<string, [string, string]> = { dia: ['dia', 'dias'], dias: ['dia', 'dias'], h: ['hora', 'horas'], min: ['minuto', 'minutos'] }

/** Contagem para leitores de tela, com as unidades por extenso e sem as partes zeradas: "3 dias e 4 horas", "1 dia". */
export function spokenMatchCountdown(ms: number): string {
  const [first, ...rest] = countdownParts(ms)
  const words = (part: CountdownPart) => `${part.value} ${spokenUnits[part.unit][part.value === 1 ? 0 : 1]}`
  return [words(first), ...rest.filter(part => part.value > 0).map(words)].join(' e ')
}

/** Nome do lado no Placar: em partida individual, o lado do titular (`my_side`) é "Você"; os demais, o time ou o atleta. */
export function sideLabel(card: Pick<MatchCard, 'my_side'>, side: MatchSideOut | undefined): string {
  if (side && side.kind === 'atleta' && side.side === card.my_side) return 'Você'
  return sideName(side)
}

/** Linha do confronto, com o lado do titular primeiro: "Leões do Cerrado × Tigres do Lago" ou, no tênis, "Você × Rafael Lima". */
export function matchupLabel(card: Pick<MatchCard, 'sides' | 'my_side'>): string {
  const [first, second] = orderedSides(card)
  return `${sideLabel(card, first)} × ${second ? sideLabel(card, second) : 'adversário a definir'}`
}

/** Texto do Placar sem partida: convida a preparar os perfis ou a marcar a próxima. */
export function emptyPlacarText(hasProfiles: boolean): string {
  return hasProfiles ? 'Que tal marcar a próxima?' : 'Prepare seus perfis esportivos e encontre a primeira.'
}

/** Rótulo do botão principal (sempre leva ao Jogar); sem perfis, "Preparar perfis" vence a próxima partida. */
export function primaryButtonLabel({ hasProfiles, hasNextMatch }: { hasProfiles: boolean; hasNextMatch: boolean }): string {
  if (!hasProfiles) return 'Preparar perfis'
  return hasNextMatch ? 'Encontrar outra partida' : 'Encontrar partida'
}
