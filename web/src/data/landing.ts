/*
 * Textos da landing da web (página pública de quem não tem sessão), centralizados como os dados visuais de
 * `arena.ts`. A landing é explicativa: sem números, estatísticas, depoimentos, pontos, atividades, moedas, carteira
 * nem partida simulada.
 */

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
