import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '../../theme'

/*
 * Primitivos próprios das telas de times (porta de `components/teams/styles.ts` da web): tons sobre a placa escura,
 * selo e título de seção e o token da sessão compartilhado pelas telas. Os botões, as ações de
 * texto, os avisos, o erro e a confirmação são os de `components/arena/controls.tsx`.
 */

/** Token Bearer da sessão, lido uma vez pela tela e entregue aos brasões e rostos; `undefined` faz cada um ler do SecureStore. */
export const TeamTokenContext = createContext<string | null | undefined>(undefined)
export const useTeamToken = () => useContext(TeamTokenContext)

/** Tons sobre o escuro (placa e telas `forest`). */
export const onDark = {
  text: '#ffffff',
  soft: 'rgba(255,255,255,0.66)',
  faint: 'rgba(255,255,255,0.5)',
  line: 'rgba(255,255,255,0.14)',
  field: 'rgba(255,255,255,0.07)',
  card: 'rgba(255,255,255,0.05)',
} as const

/** Selo menta acima do nome da carteirinha: "Convite", "Link do time", "Prévia". */
export function MintBadge({ children }: { children: string }) {
  return <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(143,224,180,0.15)', marginBottom: 3 }}>
    <Text style={{ color: colors.mint, fontSize: 9.5, fontWeight: '700' }}>{children}</Text>
  </View>
}

/** Título de seção da tela clara (.sec-title): rótulo em negrito e, à direita, uma ação de texto. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={{ marginTop: 22, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
    <Text accessibilityRole="header" style={{ flexShrink: 1, color: colors.ink, fontSize: 15, fontWeight: '800' }}>{title}</Text>
    {action ?? null}
  </View>
}
