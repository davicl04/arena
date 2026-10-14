import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useThemeColors } from '../../hooks/useTheme'
import { eventDateParts } from '../../utils/format'
import { Icon } from '../Icon'
import { Avatar } from '../media'

/*
 * Linhas das filas (protótipos A2 e AD1): cartão branco com a figura à esquerda (miniatura, foto ou bloco de data), o
 * título, um resumo e o selo, e o chevron. Cada linha é um botão de 44 pt ou mais que abre a folha do item.
 */

/** Rótulo falado da linha: o resumo e, se houver, o texto do selo. */
const spoken = (label: string, status?: string) => (status ? `${label}. ${status}` : label)

function RowShell({ label, onPress, lead, title, text, children }: { label: string; onPress: () => void; lead: ReactNode; title: string; text: string; children?: ReactNode }) {
  const colors = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.surface, padding: 10 }}>
    {lead}
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 11, lineHeight: 15 }}>{text}</Text>
      {children}
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="chevron" size={18} color={colors['ink-muted']} /></View>
  </Pressable>
}

/** Linha de pessoa: foto, nome do pedido ou do organizador, resumo e selo. */
export function PersonRow({ name, avatarPath, token, title, text, badge, status, onPress }: {
  name: string; avatarPath: string | null; token: string | null; title: string; text: string; badge?: ReactNode
  /** Texto do selo, lido pelos leitores de tela junto com a linha. */
  status?: string
  onPress: () => void
}) {
  return <RowShell label={spoken(`${title}. ${text}`, status)} onPress={onPress} title={title} text={text}
    lead={<Avatar path={avatarPath} name={name} token={token} size={44} />}>{badge}</RowShell>
}

/** Bloco de data da linha de evento: mês em caixa alta e o dia grande, sobre o verde-escuro. */
function DateBlock({ iso }: { iso: string | null | undefined }) {
  const colors = useThemeColors()
  const date = eventDateParts(iso)
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }}>
    <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>{(date?.month ?? '—').toUpperCase()}</Text>
    <Text style={{ color: '#ffffff', fontSize: 18, lineHeight: 20, fontWeight: '800' }}>{date?.day ?? '—'}</Text>
  </View>
}

/** Linha de evento (ou de inscrição): bloco de data, nome, resumo e selo. */
export function EventRow({ title, startsAt, text, badge, status, onPress }: { title: string; startsAt: string | null | undefined; text: string; badge?: ReactNode; status?: string; onPress: () => void }) {
  const date = eventDateParts(startsAt)
  return <RowShell label={spoken(`${title}. ${date ? `${date.label}. ` : ''}${text}`, status)} onPress={onPress} title={title} text={text} lead={<DateBlock iso={startsAt} />}>{badge}</RowShell>
}

/** Linha com a figura que a tela escolher (miniatura do comprovante). */
export function LeadRow({ label, lead, title, text, badge, status, onPress }: { label: string; lead: ReactNode; title: string; text: string; badge?: ReactNode; status?: string; onPress: () => void }) {
  return <RowShell label={spoken(label, status)} onPress={onPress} lead={lead} title={title} text={text}>{badge}</RowShell>
}

/** Lista de linhas com espaço entre os cartões. */
export function RowList({ label, children }: { label: string; children: ReactNode }) {
  return <View accessibilityLabel={label} style={{ marginTop: 4, gap: 8 }}>{children}</View>
}
