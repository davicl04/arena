import type { Position } from '../../api/client'
import type { MeStandings, PositionStanding, StandingLine, TeamStandings } from '../../api/play'
import type { RunBest } from '../../api/runs'
import { footballFormat, placementRequired, positionOptions, rankingTiers, runDistances, shownTier, tiers } from '../../data/arena'
import type { FootballFormat, RunDistance, TierKey } from '../../data/arena'

/**
 * Linha do elo (H1) da placa do Jogar, derivada de `GET /me/standings` (contrato 0002, seção 3) e, na corrida, de
 * `GET /me/run-bests` (porta de `web/src/components/play/tierLines.ts`). As faixas enfrentadas vêm da API (`faces`); o
 * cliente só monta o texto. Quem está em classificação nunca recebe elo.
 */
export type TierLineView =
  | { kind: 'ranked'; tier: TierKey; title: string; detail: string; levels: string }
  | { kind: 'placement'; title: string; played: number; required: number }
  | { kind: 'no-mark'; title: string; detail: string }

/** Posição escolhida no avulso: uma das quatro ou qualquer posição (preenchimento automático). */
export type AvulsoPosition = Position | 'qualquer'

const tierRank = (tier: TierKey) => rankingTiers.findIndex(item => item.image === tier)
const lower = (value: string) => value.toLocaleLowerCase('pt-BR')

/** Elo exibível da linha: só em `ranqueado` e com a classificação completa. */
export function rankedTier(line: StandingLine | undefined): TierKey | null {
  return line?.state === 'ranqueado' ? shownTier(line.tier, line.played, line.required || placementRequired) : null
}

/** "Bronze, Prata ou Ouro", a partir de `faces`; sem elo, "qualquer nível". */
export function levelsText(line: StandingLine): string {
  const names = (line.faces ?? []).filter(tier => tier in tiers).map(tier => tiers[tier].name)
  if (line.faces_any_level || !names.length) return 'qualquer nível'
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : names[0]
}

/** "Enfrenta Bronze, Prata ou Ouro", a partir de `faces`; sem elo, "Enfrenta qualquer nível". */
export function facesText(line: StandingLine): string {
  return `Enfrenta ${levelsText(line)}`
}

/** Tempo da marca em h:mm:ss ou m:ss. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function placement(lines: StandingLine[], title: string): TierLineView {
  const played = lines.reduce((max, line) => Math.max(max, line.played || 0), 0)
  return { kind: 'placement', title, played, required: lines[0]?.required || placementRequired }
}

/** Uma linha (time × formato ou tênis): o elo com "Enfrenta…" ou a classificação "n de 3". */
export function lineView(line: StandingLine | undefined): TierLineView {
  const tier = rankedTier(line)
  if (line && tier) return { kind: 'ranked', tier, title: tiers[tier].name, detail: facesText(line), levels: levelsText(line) }
  return placement(line ? [line] : [], 'Em classificação')
}

/** Com meu time: a linha do formato escolhido no time representado. */
export function teamLine(team: TeamStandings | undefined, format: FootballFormat): TierLineView {
  return lineView(team?.formats.find(line => line.format === format))
}

/**
 * Avulso: as entradas individuais da posição (todas, em "qualquer posição"). Sem formato ranqueado,
 * "Em classificação como {posição}" com o maior `played`; com algum, o maior elo, com formato e posição
 * no texto ("Ouro no society como atacante").
 */
export function avulsoLine(individual: PositionStanding[], position: AvulsoPosition): TierLineView {
  const lines = position === 'qualquer' ? individual : individual.filter(line => line.position === position)
  let best: { line: PositionStanding; tier: TierKey } | null = null
  for (const line of lines) {
    const tier = rankedTier(line)
    if (tier && (!best || tierRank(tier) > tierRank(best.tier))) best = { line, tier }
  }
  if (best) {
    const { line, tier } = best
    const where = `no ${lower(footballFormat[line.format]?.label ?? line.format)}`
    const as = positionOptions.find(option => option.value === line.position)?.label
    return { kind: 'ranked', tier, title: `${tiers[tier].name} ${where}${as ? ` como ${lower(as)}` : ''}`, detail: facesText(line), levels: levelsText(line) }
  }
  const label = positionOptions.find(option => option.value === position)?.label
  return placement(lines, label ? `Em classificação como ${lower(label)}` : 'Em classificação')
}

/**
 * Corrida: o elo da distância e o melhor tempo com a origem, a partir dos cartões de `GET /me/run-bests` ("Ouro nos
 * 5 km" · "Melhor 24:12 · treino"). Sem marca, o texto do contrato; o elo nunca vai a quem está sem marca.
 */
export function runBestLine(bests: readonly RunBest[], distance: RunDistance): TierLineView {
  const label = runDistances.find(item => item.value === distance)?.label ?? `${distance} km`
  const card = bests.find(item => item.distance_km === distance)
  const tier = card ? shownTier(card.tier, card.marks, 1) : null
  if (card?.best && tier) {
    const origin = card.best.origin
    return {
      kind: 'ranked', tier, title: `${tiers[tier].name} nos ${label}`, levels: 'qualquer nível',
      detail: `Melhor ${formatDuration(card.best.duration_s)} · ${origin.source === 'treino' ? lower(origin.label) : origin.label}`,
    }
  }
  return { kind: 'no-mark', title: `Sem marca nos ${label}`, detail: 'Registre um treino ou prova para entrar no ranking' }
}

/** Resposta com as listas sempre presentes (a leitura não quebra com um campo ausente). */
export function normalizeStandings(data: Partial<MeStandings> | null | undefined) {
  return {
    teams: data?.futebol?.teams ?? [],
    individual: data?.futebol?.individual ?? [],
    tenis: data?.tenis,
    corrida: data?.corrida ?? [],
  }
}
