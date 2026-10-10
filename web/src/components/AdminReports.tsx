import { useEffect, useState } from 'react'
import { apiUrl, request } from '../api/client'

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
  return <section className="admin-reports" aria-labelledby="admin-reports-title">
    <div className="social-heading"><div><p className="eyebrow">MODERAÇÃO</p><h2 id="admin-reports-title">Denúncias</h2></div><select aria-label="Estado das denúncias" value={status} onChange={event => { setStatus(event.target.value); void load(event.target.value) }}><option value="pending">Pendentes</option><option value="resolved">Resolvidas</option></select></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!reports.length && !busy ? <p className="muted">Nenhuma denúncia nesta fila.</p> : reports.map(report => <article className="admin-report" key={report.id}>
      <p><b>{report.target_type === 'user' ? 'Conta' : report.target_type === 'post' ? 'Publicação' : 'Comentário'} · #{report.target_id}</b><small>{report.reason.replaceAll('_', ' ')} · {new Date(report.created_at).toLocaleString('pt-BR')}</small></p>
      {report.description && <p className="admin-report-description">{report.description}</p>}
      {report.target_preview && <div className="admin-report-preview"><b>{report.target_preview.author || report.target_preview.name || 'Conteúdo denunciado'}</b><p>{report.target_preview.caption || report.target_preview.body || (report.target_preview.social_public === false ? 'Conta privada' : '')}</p>{report.target_preview.image_url && <img src={apiUrl(report.target_preview.image_url)} alt="Imagem da publicação denunciada" />}</div>}
      {status === 'pending' && <><label htmlFor={`decision-${report.id}`}>Decisão</label><select id={`decision-${report.id}`} value={decisions[report.id]?.action ?? (report.target_type === 'user' ? 'suspend' : 'dismiss')} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: event.target.value, justification: old[report.id]?.justification ?? '' } }))}><option value="dismiss">Dispensar denúncia</option>{report.target_type !== 'user' && <option value="remove">Remover conteúdo</option>}<option value="suspend">Suspender conta responsável</option>{report.target_type === 'user' && <option value="reactivate">Reativar conta</option>}</select><label htmlFor={`justification-${report.id}`}>Justificativa obrigatória</label><textarea id={`justification-${report.id}`} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: old[report.id]?.action ?? (report.target_type === 'user' ? 'suspend' : 'dismiss'), justification: event.target.value } }))} /><button className="primary full-width" disabled={busy} onClick={() => void decide(report)}>Registrar decisão</button></>}
      {status === 'resolved' && report.target_user_id && report.target_user_active === false && <>
        <p>Conta responsável suspensa · #{report.target_user_id}</p>
        <label htmlFor={`reactivate-${report.id}`}>Justificativa para reativação</label>
        <textarea id={`reactivate-${report.id}`} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: 'reactivate', justification: event.target.value } }))} />
        <button className="primary full-width" disabled={busy} onClick={() => void reactivate(report)}>Reativar conta</button>
      </>}
    </article>)}
    {cursor && <button className="secondary full-width" disabled={busy} onClick={async () => { try { const page = await request<ReportPage>(`/admin/reports?status=${status}&cursor=${encodeURIComponent(cursor)}`); setReports(old => [...old, ...page.items]); setCursor(page.next_cursor) } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao paginar denúncias.') } }}>Carregar mais</button>}
  </section>
}
