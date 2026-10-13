import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { getOrganizerStatus, refusalText, sentence } from '../api/organizer'
import type { OrganizerRequest } from '../api/organizer'
import { ArenaMark } from '../components/arena/ArenaMark'
import { ActionButton, Notice, Situation, TextAction } from '../components/arena/controls'
import { OrganizerRequestForm } from '../components/organizer/OrganizerRequestForm'
import { loadProfiles, useCities } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { Icon } from '../components/Icon'


const rules: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string }[] = [
  { icon: 'banknote', title: 'Pagamento fora do Arena', text: 'Você recebe as inscrições por Pix e informa a chave. O Arena não recebe nem repassa dinheiro.' },
  { icon: 'receipt', title: 'Você analisa os comprovantes', text: 'Aprova ou recusa com motivo; quem não envia no prazo perde a vaga.' },
  { icon: 'file-text', title: 'Você resolve divergências', text: 'Quando os placares não batem, sua decisão vale e fica registrada.' },
  { icon: 'shield-alert', title: 'Eventos pagos passam pela administração', text: 'Antes de publicar, o Arena confere os dados do evento.' },
]

/**
 * "Seja organizador" (P5): as regras do papel antes do formulário do pedido. Com pedido em análise ou a permissão já ativa,
 * mostra a situação no lugar do formulário.
 */
export default function OrganizerRequestScreen({ navigation, onExpired }: ScreenProps<'organizer-request'>) {
  const status = useResource(getOrganizerStatus, onExpired, { fallback: 'Não foi possível conferir o seu pedido de organizador.' })
  const cities = useCities(onExpired)
  const profiles = useResource(loadProfiles, onExpired)
  const [sent, setSent] = useState<OrganizerRequest | null>(null)
  const profileList = Array.isArray(profiles.data) ? profiles.data : []
  const defaultCityId = (profileList.find(profile => profile.sport === 'futebol') ?? profileList[0])?.city_id ?? null
  const state = status.data?.state
  const back = <View style={{ marginTop: 14 }}><ActionButton block tone="outline" title="Voltar" onPress={navigation.back} /></View>
  const ready = !status.loading && !cities.loading && !profiles.loading

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <View style={{ overflow: 'hidden', borderRadius: 20, backgroundColor: colors.forest, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -24, bottom: -20, opacity: 0.06 }}><ArenaMark width={180} height={110} color="#ffffff" /></View>
        <Text style={{ color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>ORGANIZAR NO ARENA</Text>
        <Text accessibilityRole="header" style={{ marginTop: 4, color: '#ffffff', fontSize: 22, fontWeight: '800' }}>Campeonatos e provas</Text>
        <Text style={{ marginTop: 6, maxWidth: 300, color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18 }}>Crie campeonatos e provas, gerencie inscrições e monte as tabelas. A permissão é concedida pela administração.</Text>
      </View>

      {status.loading ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 16, color: colors.ink, fontSize: 12 }}>Carregando…</Text> : null}
      {status.error ? <View><Notice>{status.error}</Notice><TextAction title="Tentar novamente" onPress={status.reload} /></View> : null}
      {cities.error && !status.error ? <View><Notice>{cities.error}</Notice><TextAction title="Tentar novamente" onPress={cities.reload} /></View> : null}

      {sent ? <View style={{ marginTop: 16 }} accessibilityLiveRegion="polite">
        <Situation tone="wait" icon="hourglass" title="Pedido enviado">{`O pedido de ${sent.display_name} está em análise. A resposta chega nas notificações.`}</Situation>
        {back}
      </View>
        : state === 'em_analise' ? <View style={{ marginTop: 16 }}>
          <Situation tone="wait" icon="hourglass" title="Pedido em análise">Você já tem um pedido em análise. A resposta chega nas notificações.</Situation>
          {back}
        </View>
          : state === 'aprovado' ? <View style={{ marginTop: 16 }}>
            <Situation tone="ok" icon="badge-check" title="Você é organizador">A seção Organizador já aparece no Menu do Perfil.</Situation>
            {back}
          </View>
            : state && ready && !status.error ? <>
              <Text accessibilityRole="header" style={{ marginTop: 22, marginBottom: 8, color: colors.ink, fontSize: 16, fontWeight: '700' }}>Como funciona</Text>
              <View accessibilityLabel="Regras do organizador" style={{ gap: 8 }}>
                {rules.map(rule => <View key={rule.title} accessible accessibilityLabel={`${rule.title}. ${rule.text}`} style={{ flexDirection: 'row', gap: 12, borderRadius: 14, backgroundColor: '#ffffff', padding: 12 }}>
                  <Icon name={rule.icon} size={20} color={colors.brand} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{rule.title}</Text>
                    <Text style={{ marginTop: 1, color: colors['ink-muted'], fontSize: 11, lineHeight: 16 }}>{rule.text}</Text>
                  </View>
                </View>)}
              </View>
              <Text accessibilityRole="header" style={{ marginTop: 22, marginBottom: 8, color: colors.ink, fontSize: 16, fontWeight: '700' }}>Seu pedido</Text>
              {state === 'recusado' && status.data?.request ? <Notice>{`Seu pedido anterior foi recusado. Motivo: ${sentence(refusalText(status.data.request.reason_code, status.data.request.reason_detail))}`}</Notice> : null}
              {state === 'revogado' && status.data?.revocation ? <Notice>{`Sua permissão foi revogada. Motivo: ${sentence(status.data.revocation.reason)}`}</Notice> : null}
              <OrganizerRequestForm cities={Array.isArray(cities.data) ? cities.data : []} defaultCityId={defaultCityId} onSent={setSent} onExpired={onExpired} />
            </> : null}
    </ScrollView>
  </KeyboardAvoidingView>
}
