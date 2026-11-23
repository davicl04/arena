import { useState } from 'react'
import { Text, View } from 'react-native'
import { sports } from '../../api/client'
import type { Profile, ProfileInput, Sport } from '../../api/client'
import { useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'
import { toast } from '../toast/toastStore'
import { profileSummary, savedTitle } from './profileSteps'
import { SportBand } from './SportBand'
import { SportProfileSheet } from './SportProfileSheet'

/**
 * Tela de modalidades no perfil do Expo (a mesma da web): "n de 3 ativas", "Onde você joga?", uma faixa por modalidade na
 * ordem de `sports` e o aviso de privacidade. Tocar numa faixa abre a folha passo a passo; no sucesso, a folha fecha, o
 * dono troca o perfil pela resposta do `PUT` (a faixa fica ativa) e aparece o toast de sucesso com o resumo.
 */
export function SportsProfiles({ profiles, onSave, onExpired }: {
  profiles: readonly Profile[]
  /** `PUT /me/sports-profiles/{sport}`: devolve o perfil salvo e atualiza a lista do dono. As falhas sobem para a folha. */
  onSave: (sport: Sport, input: ProfileInput) => Promise<Profile>
  onExpired: () => void
}) {
  const c = useThemeColors()
  const [open, setOpen] = useState<Sport | null>(null)
  const active = sports.filter(item => profiles.some(profile => profile.sport === item.value)).length
  function saved(profile: Profile, isNew: boolean) {
    setOpen(null)
    toast.success(savedTitle(profile.sport, isNew), { description: profileSummary(profile) })
  }
  return <View accessibilityLabel="Suas modalidades">
    <Text style={{ color: c.eyebrow, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{`${active} de ${sports.length} ativas`}</Text>
    <Text accessibilityRole="header" style={{ marginTop: 4, marginBottom: 16, color: c.heading, fontSize: 22, fontWeight: '800' }}>Onde você joga?</Text>
    {sports.map(item => <SportBand key={item.value} sport={item.value} profile={profiles.find(profile => profile.sport === item.value)} onPress={() => setOpen(item.value)} />)}
    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 13, padding: 13, backgroundColor: c['brand-soft'] }}>
      <Icon name="shield" size={18} color={c.brand} />
      <Text style={{ flex: 1, color: c['ink-muted'], fontSize: 11.5, lineHeight: 18 }}>Seus perfis começam privados. Você cuida dos dados da sua trajetória.</Text>
    </View>
    {open ? <SportProfileSheet key={open} sport={open} profile={profiles.find(profile => profile.sport === open)} onSave={onSave} onSaved={saved} onClose={() => setOpen(null)} onExpired={onExpired} /> : null}
  </View>
}
