import { useState } from 'react'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { TeamMember } from '../../api/teams'
import { positionShort } from '../../data/arena'
import { colors } from '../../theme'
import { MemberFace } from './MemberFace'
import { positionLabel, ROSTER_LIMIT } from './teamView'
import { TextAction } from '../arena/controls'
import { SectionTitle } from './ui'

/**
 * Elenco em grade de rostos (E1): braçadeira "C" nos representantes, primeiro nome e posição, quatro por linha. Acima de
 * 11 atletas, o "+N" mostra todos. Tocar num rosto abre a folha do atleta.
 */
export function RosterGrid({ members, loading, error, onRetry, onOpen, action }: {
  members: TeamMember[]
  loading: boolean
  error: string
  onRetry: () => void
  onOpen: (member: TeamMember) => void
  /** Ação do título (Convidar, para representantes). */
  action?: ReactNode
}) {
  const [all, setAll] = useState(false)
  const shown = all ? members : members.slice(0, ROSTER_LIMIT)
  const hidden = members.length - shown.length
  return <View>
    <SectionTitle title={`Elenco${members.length ? ` · ${members.length}` : ''}`} action={action} />
    <View style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 6, paddingVertical: 10 }}>
      {loading ? <View accessibilityLabel="Carregando elenco" style={{ paddingVertical: 24, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /><Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 12 }}>Carregando elenco…</Text></View>
        : error ? <View style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12.5, lineHeight: 18 }}>{error}</Text>
          <TextAction title="Tentar novamente" onPress={onRetry} />
        </View>
        : <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {shown.map(member => {
            const representative = member.role === 'representante'
            const label = [member.name, positionLabel(member.position), representative ? 'Representante' : null, member.is_me ? 'você' : null].filter(Boolean).join(' · ')
            return <View key={member.user_id} style={{ width: '25%', paddingHorizontal: 2 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Abre as ações do atleta" onPress={() => onOpen(member)}
                style={{ minHeight: 44, alignItems: 'center', gap: 4, paddingVertical: 2 }}>
                <MemberFace name={member.name} avatarUrl={member.avatar_url} representative={representative} size="grid" />
                <Text numberOfLines={1} style={{ maxWidth: '100%', color: colors.ink, fontSize: 10.5, fontWeight: '600' }}>{member.is_me ? 'Você' : member.first_name}</Text>
                <Text style={{ minHeight: 12, color: colors['ink-muted'], fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 }}>{member.position ? positionShort[member.position] : ''}</Text>
              </Pressable>
            </View>
          })}
          {hidden > 0 ? <View style={{ width: '25%', paddingHorizontal: 2 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver todos os ${members.length} atletas`} onPress={() => setAll(true)} style={{ minHeight: 44, alignItems: 'center', gap: 4, paddingVertical: 2 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.subtle }}>
                <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>+{hidden}</Text>
              </View>
              <Text style={{ color: colors.ink, fontSize: 10.5, fontWeight: '600' }}>Ver todos</Text>
            </Pressable>
          </View> : null}
        </View>}
    </View>
  </View>
}
