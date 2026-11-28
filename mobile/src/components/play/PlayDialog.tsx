import type { ReactNode } from 'react'
import { Modal, ScrollView, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { colors } from '../../theme'
import { ArenaMark } from '../arena/ArenaMark'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Text } from '../Text'
import { ToastViewport } from '../toast/ToastViewport'

const MARK_WIDTH = 420
const MARK_HEIGHT = 260

/**
 * Tela cheia das respostas do Jogar (a proposta P2 e a oferta de vaga), como os diálogos da web: o clarão verde sobre
 * `night`, o Coliseu em marca-d'água, o sobretítulo menta e o conteúdo centrado, que rola se não couber. Cobre a tela
 * inteira, inclusive a navegação inferior. Monte-a apenas enquanto estiver aberta. O botão de voltar do Android fecha
 * (`onClose`), a menos que `locked` (resposta em andamento); as ações ficam no conteúdo. `description` não aparece: o
 * leitor de tela a lê junto do título (o `sr-only` da web).
 */
export function PlayDialog({ title, description, testID, locked = false, onClose, children }: { title: string; description?: string; testID: string; locked?: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => { if (!locked) onClose() }}>
    <StatusBar style="light" />
    <View testID={testID} accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.night }}>
      {/* `radial-gradient(120% 70% at 50% 30%, #1b5a3d 0%, night 70%)` da web. */}
      <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="play-dialog-glow" cx="50%" cy="30%" rx="120%" ry="70%">
            <Stop offset="0" stopColor="#1b5a3d" />
            <Stop offset="0.7" stopColor={colors.night} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#play-dialog-glow)" />
      </Svg>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: '16%', left: '50%', marginLeft: -MARK_WIDTH / 2, width: MARK_WIDTH, height: MARK_HEIGHT, opacity: 0.05 }}>
        <ArenaMark width={MARK_WIDTH} height={MARK_HEIGHT} color="#ffffff" />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 18, paddingHorizontal: 22, paddingTop: 30 + insets.top, paddingBottom: 30 + insets.bottom }}>
        <Text accessibilityRole="header" accessibilityLabel={description ? `${title}. ${description}` : undefined} style={{ textAlign: 'center', color: colors.mint, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>{title}</Text>
        {children}
      </ScrollView>
    </View>
    <ToastViewport />
  </Modal>
}

/** Pílula de estado da tela cheia ("Você aceitou" em menta, "Aguardando…" em vidro), com o ícone dentro. */
export function PlayPill({ icon, tone, children }: { icon: IconName; tone: 'mint' | 'glass'; children: string }) {
  const ink = tone === 'mint' ? colors.night : '#ffffff'
  return <View style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: tone === 'mint' ? colors.mint : 'rgba(255,255,255,0.12)' }}>
    <Icon name={icon} size={14} color={ink} />
    <Text style={{ flexShrink: 1, color: ink, fontSize: 10.5, fontWeight: '700' }}>{children}</Text>
  </View>
}
