/*
 * Textos da landing da web (página pública de quem não tem sessão), centralizados como os dados visuais de
 * `arena.ts`. A landing é explicativa: sem números, estatísticas, depoimentos, pontos, atividades, moedas, carteira
 * nem partida simulada.
 */
import type { Sport } from '@/api/client'

/** Assinatura da marca: rodapé da landing e metade da marca da tela de entrada. */
export const arenaTagline = 'Futebol, tênis e corrida amadores.'

/** Hero "Estádio à noite": título com o trecho em menta, texto de apoio e rótulo da seta de rolagem. */
export const landingHero = {
  title: { before: 'A ', highlight: 'arena', after: ' te chama' },
  lede: 'A arena do esporte amador: partidas do seu nível na sua cidade, times, campeonatos e um ranking para cada modalidade.',
  scrollLabel: 'Rolar para o conteúdo',
} as const

/** Par de entrada, repetido no hero e no fecho: o botão abre a entrada no modo Entrar, o convite no modo Criar conta. */
export const landingEntry = {
  enter: 'Entrar na Arena',
  firstTime: 'Primeira vez por aqui?',
  register: 'Crie sua conta',
} as const

/** Fecho da landing, antes do rodapé. */
export const landingClosing = {
  title: 'Os portões estão abertos.',
} as const

/*
 * Seções informativas, entre o hero e o fecho. Os títulos `h2` ficam só para leitores de tela (as seções não têm
 * título visível acima); o tom de cada coluna vem dos tokens `--color-*-tint` da seção das colunas em ui.css.
 */
export const landingSectionTitles = {
  sports: 'Modalidades',
  steps: 'Como funciona',
  more: 'Mais da Arena',
} as const

/** Modalidades em colunas: o número, o nome e o valor vêm de `sports` (api/client); aqui, a descrição, as etiquetas e o tom. */
export const landingSportDetails: Record<Sport, { description: string; tags: readonly string[]; tone: string }> = {
  futebol: {
    description: 'Monte o seu time e convide amigos, ou entre avulso numa partida aberta.',
    tags: ['Society', 'Campo', 'Futsal'],
    tone: 'var(--color-sport-futebol-tint)',
  },
  tenis: {
    description: 'Partidas de simples com placar por sets, confirmado pelos dois lados.',
    tags: ['Simples', 'Sets', 'Rating'],
    tone: 'var(--color-sport-tenis-tint)',
  },
  corrida: {
    description: 'Registre as suas marcas e se inscreva nas provas da sua cidade.',
    tags: ['Marcas', 'Provas', 'Distâncias'],
    tone: 'var(--color-sport-corrida-tint)',
  },
}

/** "Como funciona": quatro passos, com numeral romano (1–4) e tons de verde crescentes. */
export const landingSteps = [
  {
    numeral: 1,
    title: 'Crie sua conta',
    text: 'E-mail e senha. A Arena é para pessoas com 18 anos ou mais.',
    tone: 'var(--color-step-1-tint)',
  },
  {
    numeral: 2,
    title: 'Monte seus perfis',
    text: 'Um perfil por modalidade, com a sua cidade e o seu jeito de jogar.',
    tone: 'var(--color-step-2-tint)',
  },
  {
    numeral: 3,
    title: 'Aperte Jogar',
    text: 'Encontre adversários do seu nível perto de você.',
    tone: 'var(--color-step-3-tint)',
  },
  {
    numeral: 4,
    title: 'Confirme o resultado',
    text: 'Os dois lados informam o placar, e o ranking se atualiza.',
    tone: 'var(--color-step-4-tint)',
  },
] as const satisfies readonly { numeral: 1 | 2 | 3 | 4; title: string; text: string; tone: string }[]

/** Rótulo de cada passo: "Passo 01" a "Passo 04". */
export const stepLabel = (numeral: number) => `Passo ${String(numeral).padStart(2, '0')}`

/** "Mais da Arena" em sanfona. */
export const landingMore = [
  { name: 'Times', text: 'Convide amigos, monte o elenco e jogue junto.' },
  { name: 'Campeonatos', text: 'Inscreva-se em torneios e ligas de organizadores.' },
  { name: 'Comunidade', text: 'Publique, siga atletas e acompanhe a sua cidade.' },
  { name: 'Privacidade', text: 'Seu perfil começa privado. Você decide o que mostrar.' },
] as const
