/*
 * Textos da landing da web (página pública de quem não tem sessão), centralizados como os dados visuais de
 * `arena.ts`. A landing é explicativa: sem números, estatísticas, depoimentos, pontos, atividades, moedas, carteira
 * nem partida simulada.
 */
import type { Sport } from '@/api/client'
import type { TierKey } from '@/data/arena'

/** Assinatura da marca: rodapé da landing e metade da marca da tela de entrada. */
export const arenaTagline = 'O esporte amador da sua cidade.'

/** Hero "Estádio à noite": título com o trecho em menta, texto de apoio e rótulo da seta de rolagem. */
export const landingHero = {
  title: { before: 'A ', highlight: 'arena', after: ' te chama' },
  lede: 'Adversários do seu nível, na sua cidade. Times, campeonatos e um ranking para cada modalidade.',
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
    description: 'Monte seu time e convoque os amigos, ou entre avulso numa partida aberta.',
    tags: ['Society', 'Campo', 'Futsal'],
    tone: 'var(--color-sport-futebol-tint)',
  },
  tenis: {
    description: 'Duelos de simples, com placar por sets confirmado pelos dois lados.',
    tags: ['Simples', 'Sets', 'Pontos'],
    tone: 'var(--color-sport-tenis-tint)',
  },
  corrida: {
    description: 'Registre suas marcas, inscreva-se nas provas da sua cidade e conquiste cada distância.',
    tags: ['Marcas', 'Provas', 'Distâncias'],
    tone: 'var(--color-sport-corrida-tint)',
  },
}

/*
 * Subida de elo, entre as modalidades e "Como funciona": explicativa, sem atribuir elo a ninguém e sem valores de
 * pontos ou posições. Os nomes, os brasões e os tons dos elos vêm de `arena.ts` (`tiers`, `tierOrder`, `tierTints`).
 */
export const landingClimb = {
  eyebrow: 'Sua ascensão · um ranking para cada modalidade',
  texts: {
    bronze: 'Toda lenda começa na primeira partida. Depois de 3, a arena define o seu nível inicial.',
    prata: 'Cada vitória confirmada pelos dois lados reergue mais um pedaço do seu Coliseu.',
    ouro: 'O Coliseu quase inteiro. Rivais à altura, na sua cidade, a cada partida.',
    diamante: 'Poucos chegam aqui. O Coliseu está de pé e a torcida sabe o seu nome.',
    lendario: 'O topo da arena. Seu nome gravado no Salão dos Lendários.',
  } satisfies Record<TierKey, string>,
} as const

/** "Como funciona": quatro passos, com numeral romano (1–4) e tons de verde crescentes. */
export const landingSteps = [
  {
    numeral: 1,
    title: 'Cruze os portões',
    text: 'Crie sua conta com e-mail e senha. A entrada é só para maiores de 18 anos.',
    tone: 'var(--color-step-1-tint)',
  },
  {
    numeral: 2,
    title: 'Escolha suas modalidades',
    text: 'Um perfil para cada esporte, com a sua cidade e o seu jeito de jogar.',
    tone: 'var(--color-step-2-tint)',
  },
  {
    numeral: 3,
    title: 'Toque em Jogar',
    text: 'Entre na arena e encontre adversários do seu nível, perto de você.',
    tone: 'var(--color-step-3-tint)',
  },
  {
    numeral: 4,
    title: 'Sele o resultado',
    text: 'Os dois lados confirmam o placar, o ranking se atualiza e você ganha seus louros para compartilhar.',
    tone: 'var(--color-step-4-tint)',
  },
] as const satisfies readonly { numeral: 1 | 2 | 3 | 4; title: string; text: string; tone: string }[]

/**
 * Rótulo de cada passo só para leitores de tela ("Passo 1" a "Passo 4"): na tela fica só o numeral romano, e o rótulo
 * evita que "Cruze os portões" se confunda com os convites de entrada da landing.
 */
export const stepLabel = (numeral: number) => `Passo ${numeral}`

/** "Mais da Arena" em sanfona. */
export const landingMore = [
  { name: 'Times', text: 'Reúna a sua turma: convide amigos, monte o elenco e jogue junto.' },
  { name: 'Campeonatos', text: 'Dispute torneios e ligas da sua cidade e entre para a história da arena.' },
  { name: 'Comunidade', text: 'Publique seus louros, faça alianças com outros atletas e acompanhe a sua cidade.' },
  { name: 'Privacidade', text: 'Seu perfil começa privado. Você decide o que mostrar.' },
] as const
