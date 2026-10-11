import { useEffect, useState } from 'react'
import { apiUrl, request } from '../api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { feedbackVariants } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* Campos da fila: seletores compactos sobre a base global de `select` (o filtro do cabeçalho tem largura automática). */
const adminSelect = 'min-h-[42px] rounded-[9px] p-[9px] text-[11px]'
const adminTextarea = 'min-h-[42px] w-full resize rounded-[9px] border border-solid border-field-border bg-white p-[9px] text-[11px] text-ink'

type Report = {
  id: number; target_type: 'post' | 'comment' | 'user'; target_id: number
  reason: string; description: string | null; status: string; created_at: string
  target_preview: { name?: string; social_public?: boolean; caption?: string; body?: string; author?: string; image_url?: string | null } | null
  target_user_id: number | null; target_user_active: boolean | null
}
type ReportPage = { items: Report[]; next_cursor: string | null }
type Decision = { action: string; justification: string }

export default function AdminReports({ onExpired }: { onExpired: () => void }) {
  const [reports, setReports] = useState<Report[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('pending')
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  async function load(nextStatus = status) {
    setBusy(true); setError('')
    try {
      const page = await request<ReportPage>(`/admin/reports?status=${nextStatus}`)
      setReports(page.items); setCursor(page.next_cursor)
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as denúncias.')
    } finally { setBusy(false) }
  }
  useEffect(() => {
    let alive = true
    request<ReportPage>('/admin/reports?status=pending').then(page => {
      if (alive) { setReports(page.items); setCursor(page.next_cursor) }
    }).catch(err => {
      if (alive) {
        if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as denúncias.')
      }
    }).finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [onExpired])
  async function decide(report: Report) {
    const form = decisions[report.id] ?? { action: report.target_type === 'user' ? 'suspend' : 'dismiss', justification: '' }
    if (form.justification.trim().length < 5) { setError('Informe uma justificativa de pelo menos 5 caracteres.'); return }
    setBusy(true); setError('')
    try {
      await request(`/admin/reports/${report.id}/decision`, 'POST', form)
      setReports(old => old.filter(item => item.id !== report.id))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar a decisão.') }
    finally { setBusy(false) }
  }
  async function reactivate(report: Report) {
    if (!report.target_user_id || busy) return
    const justification = decisions[report.id]?.justification.trim() ?? ''
    if (justification.length < 5) { setError('Informe uma justificativa de pelo menos 5 caracteres.'); return }
    setBusy(true); setError('')
    try {
      await request(`/admin/users/${report.target_user_id}/status?active=true&justification=${encodeURIComponent(justification)}`, 'PUT', {})
      setReports(old => old.map(item => item.target_user_id === report.target_user_id ? { ...item, target_user_active: true } : item))
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
      setError(err instanceof Error ? err.message : 'Não foi possível reativar a conta.')
    } finally { setBusy(false) }
  }
  return <Card as="section" className="my-[18px] p-4" aria-labelledby="admin-reports-title">
    <div className="mb-[15px] flex items-center justify-between gap-3"><h2 id="admin-reports-title" className="text-[15px]">Denúncias</h2><select className={cn(adminSelect, 'w-auto')} aria-label="Estado das denúncias" value={status} onChange={event => { setStatus(event.target.value); void load(event.target.value) }}><option value="pending">Pendentes</option><option value="resolved">Resolvidas</option></select></div>
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
    {!reports.length && !busy ? <p className="text-[11px] leading-[1.6] text-ink-muted">Nenhuma denúncia nesta fila.</p> : reports.map(report => <article className="my-3 rounded-xl border border-solid border-line p-[13px]" key={report.id}>
      <p className="grid gap-1 text-[11px]"><b>{report.target_type === 'user' ? 'Conta' : report.target_type === 'post' ? 'Publicação' : 'Comentário'} · #{report.target_id}</b><small className="text-ink-muted [font-size:smaller]">{report.reason.replaceAll('_', ' ')} · {new Date(report.created_at).toLocaleString('pt-BR')}</small></p>
      {report.description && <p className="mt-2 text-[11px] leading-[1.5]">{report.description}</p>}
      {report.target_preview && <div className="my-2.5 rounded-[9px] bg-app p-2.5 text-[11px]"><b>{report.target_preview.author || report.target_preview.name || 'Conteúdo denunciado'}</b><p className="my-1.5 leading-[1.5] wrap-anywhere">{report.target_preview.caption || report.target_preview.body || (report.target_preview.social_public === false ? 'Conta privada' : '')}</p>{report.target_preview.image_url && <img className="my-2 block aspect-square w-[min(100%,220px)] object-cover" src={apiUrl(report.target_preview.image_url)} alt="Imagem da publicação denunciada" />}</div>}
      {status === 'pending' && <><label htmlFor={`decision-${report.id}`}>Decisão</label><select className={adminSelect} id={`decision-${report.id}`} value={decisions[report.id]?.action ?? (report.target_type === 'user' ? 'suspend' : 'dismiss')} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: event.target.value, justification: old[report.id]?.justification ?? '' } }))}><option value="dismiss">Dispensar denúncia</option>{report.target_type !== 'user' && <option value="remove">Remover conteúdo</option>}<option value="suspend">Suspender conta responsável</option>{report.target_type === 'user' && <option value="reactivate">Reativar conta</option>}</select><label htmlFor={`justification-${report.id}`}>Justificativa obrigatória</label><textarea id={`justification-${report.id}`} className={adminTextarea} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: old[report.id]?.action ?? (report.target_type === 'user' ? 'suspend' : 'dismiss'), justification: event.target.value } }))} /><Button className="mt-[18px] min-h-10 w-full" disabled={busy} onClick={() => void decide(report)}>Registrar decisão</Button></>}
      {status === 'resolved' && report.target_user_id && report.target_user_active === false && <>
        <p>Conta responsável suspensa · #{report.target_user_id}</p>
        <label htmlFor={`reactivate-${report.id}`}>Justificativa para reativação</label>
        <textarea id={`reactivate-${report.id}`} className={adminTextarea} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: 'reactivate', justification: event.target.value } }))} />
        <Button className="mt-[18px] min-h-10 w-full" disabled={busy} onClick={() => void reactivate(report)}>Reativar conta</Button>
      </>}
    </article>)}
    {cursor && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy} onClick={async () => { try { const page = await request<ReportPage>(`/admin/reports?status=${status}&cursor=${encodeURIComponent(cursor)}`); setReports(old => [...old, ...page.items]); setCursor(page.next_cursor) } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao paginar denúncias.') } }}>Carregar mais</Button>}
  </Card>
}
