import { Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { eventNoun } from '../../data/arena'
import { colors } from '../../theme'
import { formatDeadline, formatPrice } from '../../utils/format'
import { PixBlock } from '../arena/PixBlock'
import type { PixInfo } from '../arena/pix'
import { Icon } from '../Icon'
import Sheet from '../Sheet'
import { Muted, Strong, Term } from './Term'

export interface PaymentInfoSheetProps {
  /** Nome do evento, abaixo do título da folha. */
  eventName: string
  /** Valor da inscrição em centavos. */
  priceCents: number
  /** Modalidade: no futebol, o valor é "por time". */
  sport?: Sport
  pix: PixInfo
  /** Fim da reserva (ISO): prazo do comprovante. Sem reserva, a folha explica a regra. */
  receiptDeadline?: string | null
  onClose: () => void
  /** Folha aberta de dentro de outra (a inscrição): "Voltar" retorna a ela. */
  onBack?: () => void
}

const steps = [
  'Reserve a vaga no Arena.',
  'Pague pelo app do seu banco, colando a chave ou o código.',
  'Volte aqui e envie o comprovante (imagem ou PDF).',
  'O organizador confere e confirma a inscrição.',
]

function SectionLabel({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={{ color: colors['ink-muted'], fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>{children.toUpperCase()}</Text>
}

/**
 * Folha "Pagamento e informações" (ⓘ do Jogar): valor, prazo do comprovante, o bloco Pix (chave e Copia e Cola em texto
 * selecionável, com Compartilhar), "Como funciona" em 4 passos, instruções e contato do organizador e o aviso de que o
 * Arena não recebe pagamentos. O app não usa a área de transferência: segure o texto para copiar.
 */
export function PaymentInfoSheet({ eventName, priceCents, sport, pix, receiptDeadline, onClose, onBack }: PaymentInfoSheetProps) {
  const deadline = formatDeadline(receiptDeadline)
  return <Sheet title="Pagamento e informações" onClose={onClose} onBack={onBack}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{eventName}</Text>
    <View accessibilityLabel="Dados do pagamento" style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
      <Term icon="ticket">Valor <Muted>·</Muted> <Strong>{formatPrice(priceCents)}</Strong>{sport === 'futebol' ? <Muted> por {eventNoun.futebol.entrant}</Muted> : null}</Term>
      <Term icon="hourglass">
        {deadline ? <>Comprovante até <Strong>{deadline}</Strong><Muted> · 48 h após reservar ou 12 h antes do evento</Muted></>
          : <>Comprovante em até <Strong>48 h</Strong> após reservar<Muted> · ou até 12 h antes do evento, o que vier primeiro</Muted></>}
      </Term>
    </View>
    <View style={{ marginTop: 8 }}><PixBlock pix={pix} priceCents={priceCents} /></View>
    <View accessibilityLabel="Como funciona" style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingVertical: 12 }}>
      <SectionLabel>Como funciona</SectionLabel>
      {steps.map((step, index) => <View key={step} style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={{ color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{index + 1}.</Text>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{step}</Text>
      </View>)}
    </View>
    {pix.instructions || pix.contact ? <View accessibilityLabel="Instruções do organizador" style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12 }}>
      <SectionLabel>Instruções do organizador</SectionLabel>
      {pix.instructions ? <Text selectable style={{ color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>{pix.instructions}</Text> : null}
      {pix.contact ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="phone" size={17} color={colors.brand} /></View>
        <Text selectable style={{ flex: 1, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>Contato <Muted>· </Muted>{pix.contact}</Text>
      </View> : null}
    </View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 4, paddingBottom: 4 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.brand} /></View>
      <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>O Arena não recebe nem guarda pagamentos. Sem comprovante no prazo, a vaga é liberada.</Text>
    </View>
  </Sheet>
}
