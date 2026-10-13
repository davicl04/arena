import { cn } from '@/lib/utils'
import { teamButton } from '../teams/styles'

/*
 * Botões e superfícies da placa `forest` e das telas cheias do Jogar (V2, P2 e a oferta de vaga): os botões `mint` e
 * `line` dos protótipos (`teamButton`, de Meus times) e o cartão de estado sobre a placa (`.st.dk`).
 */
export const darkOutline = cn(teamButton({ tone: 'line', size: 'md' }), 'flex-1 border-white/40')
export const darkMint = cn(teamButton({ tone: 'mint', size: 'md' }), 'flex-1 hover:bg-mint/90')

/** Cartão de estado sobre a placa (`.st.dk`): vidro claro sobre o verde, com contorno fino. */
export const plateCard = 'grid w-full gap-3 rounded-[18px] bg-white/6 p-4 text-left text-white shadow-[inset_0_0_0_1px_#ffffff1f]'
