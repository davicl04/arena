import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { User } from '../api/client'
import { adminReportsPath, previewText, reportReasonLabel, reportTargetLabel } from '../api/moderation'
import type { AdminReport, ReportStatus } from '../api/moderation'
import AdminGate from '../components/admin/AdminGate'
import { ReportSheet } from '../components/admin/ReportSheet'
import { SectionTabs } from '../components/events/SectionTabs'
import { Icon } from '../components/Icon'
import { LeadRow, RowList } from '../components/review/Rows'
import { Hint } from '../components/arena/controls'
import { toast } from '../components/toast/toastStore'
import { ListMessage, LoadMore } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { useSessionToken } from '../hooks/useSessionToken'
import { useThemeColors } from '../hooks/useTheme'
import { relativeTime } from '../utils/relativeTime'

const tabs: { value: ReportStatus; label: string }[] = [{ value: 'pending', label: 'Pendentes' }, { value: 'resolved', label: 'Resolvidas' }]

/** Resumo da linha: quem é o alvo e um trecho do conteúdo, quando a API traz a prévia. */
function snippet(report: AdminReport): string {
  const preview = report.target_preview
  const who = preview?.author || preview?.name
  const text = preview ? previewText(preview) : ''
  return [who, text].filter(Boolean).join(': ')
}

function Reports({ onExpired }: { onExpired: () => void }) {
  const colors = useThemeColors()
  const token = useSessionToken()
  const [status, setStatus] = useState<ReportStatus>('pending')
  const list = usePagedList<AdminReport>(adminReportsPath(status), onExpired)
  const [open, setOpen] = useState<AdminReport | null>(null)
  const pending = status === 'pending'
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <Hint>Decida cada denúncia com uma justificativa; a decisão fica registrada.</Hint>
    <View style={{ marginTop: 10 }}>
      <SectionTabs label="Estado das denúncias" items={tabs} value={status} onChange={setStatus} />
    </View>
    <View style={{ paddingTop: 8 }}>
      <ListMessage list={list} loadingText="Carregando denúncias…" emptyTitle={pending ? 'Nenhuma denúncia pendente' : 'Nenhuma denúncia resolvida'}
        emptyText={pending ? 'Quando alguém denunciar uma publicação, um comentário ou uma conta, ela aparece aqui.' : 'As denúncias decididas aparecem aqui.'} />
      {list.items.length > 0 ? <RowList label={pending ? 'Denúncias pendentes' : 'Denúncias resolvidas'}>
        {list.items.map(report => <LeadRow key={report.id} label={`${reportTargetLabel(report.target_type)} número ${report.target_id}: ${reportReasonLabel(report.reason)}`}
          title={`${reportTargetLabel(report.target_type)} · #${report.target_id}`}
          text={[reportReasonLabel(report.reason), relativeTime(report.created_at), snippet(report)].filter(Boolean).join(' · ')}
          lead={<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors['warning-bg'] }}>
            <Icon name="alert" size={20} color={colors.warning} />
          </View>} onPress={() => setOpen(report)} />)}
      </RowList> : null}
      <LoadMore list={list} label="Carregar mais denúncias" />
    </View>
    {open ? <ReportSheet report={open} token={token} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(decided, message) => {
        list.setItems(old => old.filter(item => item.id !== decided.id))
        setOpen(null)
        toast.success(message)
      }}
      onReactivated={reactivated => {
        // A conta volta ao ar em todas as denúncias do mesmo responsável.
        list.setItems(old => old.map(item => item.target_user_id === reactivated.target_user_id ? { ...item, target_user_active: true } : item))
        setOpen(null)
        toast.success('Conta reativada.')
      }} /> : null}
  </ScrollView>
}

/**
 * Moderação (Denúncias): fila de denúncias de publicação, comentário, conta e mensagem da partida, com a prévia e a
 * decisão justificada, como na web. Só para `is_admin`; o servidor também responde 403 aos demais.
 */
export default function ModerationScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  return <AdminGate user={user}><Reports onExpired={onExpired} /></AdminGate>
}
