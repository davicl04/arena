import { useState } from 'react'
import { apiUrl, request } from '../api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { toast } from '@/components/ui/toast'
import { errorClass } from '@/components/organizer/fieldStyles'
import { usePagedList } from '@/hooks/usePagedList'
import { isStale, useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'

/* Campos da fila: seletores compactos sobre a base global de `select` (o filtro do cabeçalho tem largura automática). */
const adminSelect = 'min-h-[42px] rounded-[9px] p-[9px] text-[11px]'
const adminTextarea = 'min-h-[42px] w-full resize rounded-[9px] border border-solid border-field-border bg-field p-[9px] text-[11px] text-ink'

type Report = {
  id: number; target_type: 'post' | 'comment' | 'user' | 'match_message'; target_id: number
  reason: string; description: string | null; status: string; created_at: string
  /** `match_message` (0002-jogar, seção 11.1): `body` (nulo se já removida), `removed`, `author`, `match_id` e `match` ("A × B"). */
  target_preview: { name?: string; social_public?: boolean; caption?: string; body?: string | null; author?: string; image_url?: string | null; removed?: boolean; match_id?: number; match?: string } | null
  target_user_id: number | null; target_user_active: boolean | null
}
type Decision = { action: string; justification: string }

const targetLabel: Record<Report['target_type'], string> = { user: 'Conta', post: 'Publicação', comment: 'Comentário', match_message: 'Mensagem da partida' }

/** Prévia da mensagem do chat da partida: a partida, o autor e o texto (ou o aviso de que já foi removido). */
function MessagePreview({ preview }: { preview: NonNullable<Report['target_preview']> }) {
  return <div className="my-2.5 rounded-[9px] bg-app p-2.5 text-[11px]" aria-label="Mensagem denunciada" role="group">
    <p className="text-[10.5px] text-ink-muted wrap-anywhere">Partida{preview.match_id ? ` #${preview.match_id}` : ''}{preview.match ? ` · ${preview.match}` : ''}</p>
    <b className="mt-1 block wrap-anywhere">{preview.author || 'Conta indisponível'}</b>
    <p className={cn('my-1.5 leading-[1.5] wrap-anywhere', preview.removed && 'text-ink-muted italic')}>{preview.removed ? 'Mensagem já removida' : preview.body}</p>
  </div>
}

const JUSTIFICATION_MESSAGE = 'Informe uma justificativa de pelo menos 5 caracteres.'
const defaultAction = (report: Report) => (report.target_type === 'user' ? 'suspend' : 'dismiss')

/*
 * Quatro níveis (plano de toasts): carregar a fila falha → `LoadError` (e "Carregar mais" no rodapé); validar a
 * justificativa → junto ao campo; decidir ou reativar → toast pelo `useSubmit` (o erro de formulário do servidor, se
 * houver, fica no cartão da denúncia); sucesso → toast.
 */
export default function AdminReports({ onExpired }: { onExpired: () => void }) {
  const [status, setStatus] = useState('pending')
  const list = usePagedList<Report>(`/admin/reports?status=${status}`, onExpired)
  const reports = list.items
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [problems, setProblems] = useState<Record<number, string>>({})
  const [acting, setActing] = useState<number | null>(null)
  const submit = useSubmit(onExpired)
  const busy = submit.busy
  const setJustification = (report: Report, action: string, justification: string) => {
    setDecisions(old => ({ ...old, [report.id]: { action, justification } }))
    setProblems(old => { const rest = { ...old }; delete rest[report.id]; return rest })
  }
  /** A justificativa curta fica junto ao campo; devolve `true` se está válida. */
  function justified(report: Report, justification: string) {
    if (justification.trim().length >= 5) return true
    setProblems(old => ({ ...old, [report.id]: JUSTIFICATION_MESSAGE }))
    return false
  }
  async function decide(report: Report) {
    const form = decisions[report.id] ?? { action: defaultAction(report), justification: '' }
    if (!justified(report, form.justification)) return
    setActing(report.id)
    const done = await submit.run(async () => { await request(`/admin/reports/${report.id}/decision`, 'POST', form); return true },
      'Não foi possível registrar a decisão.', cause => { if (isStale(cause)) list.reload() })
    if (!done) return
    list.setItems(old => old.filter(item => item.id !== report.id))
    toast.success(report.target_type === 'match_message' && form.action === 'remove'
      ? 'Mensagem removida: o texto some para todos na partida e o registro fica guardado.'
      : 'Decisão registrada.')
  }
  async function reactivate(report: Report) {
    if (!report.target_user_id || busy) return
    const justification = decisions[report.id]?.justification.trim() ?? ''
    if (!justified(report, justification)) return
    setActing(report.id)
    const done = await submit.run(async () => {
      await request(`/admin/users/${report.target_user_id}/status?active=true&justification=${encodeURIComponent(justification)}`, 'PUT', {})
      return true
    }, 'Não foi possível reativar a conta.')
    if (!done) return
    list.setItems(old => old.map(item => item.target_user_id === report.target_user_id ? { ...item, target_user_active: true } : item))
    toast.success('Conta reativada.')
  }
  const formError = (report: Report) => acting === report.id && submit.error
    ? <p className={feedbackVariants()} role="alert">{submit.error}</p> : null
  return <Card as="section" className="my-[18px] p-4" aria-labelledby="admin-reports-title">
    <div className="mb-[15px] flex items-center justify-between gap-3"><h2 id="admin-reports-title" className="text-[15px]">Denúncias</h2><select className={cn(adminSelect, 'w-auto')} aria-label="Estado das denúncias" value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pendentes</option><option value="resolved">Resolvidas</option></select></div>
    {list.loading && <p role="status" className="text-[11px] text-ink-muted">Carregando as denúncias…</p>}
    {list.error && <LoadError size="section" title="Não foi possível carregar as denúncias" text={list.error.message} cause={list.error} onRetry={list.reload} />}
    {!list.loading && !list.error && !reports.length ? <p className="text-[11px] leading-[1.6] text-ink-muted">Nenhuma denúncia nesta fila.</p> : reports.map(report => <article className="my-3 rounded-xl border border-solid border-line p-[13px]" key={report.id}>
      <p className="grid gap-1 text-[11px]"><b>{targetLabel[report.target_type]} · #{report.target_id}</b><small className="text-ink-muted [font-size:smaller]">{report.reason.replaceAll('_', ' ')} · {new Date(report.created_at).toLocaleString('pt-BR')}</small></p>
      {report.description && <p className="mt-2 text-[11px] leading-[1.5]">{report.description}</p>}
      {report.target_preview && report.target_type === 'match_message' && <MessagePreview preview={report.target_preview} />}
      {report.target_preview && report.target_type !== 'match_message' && <div className="my-2.5 rounded-[9px] bg-app p-2.5 text-[11px]"><b>{report.target_preview.author || report.target_preview.name || 'Conteúdo denunciado'}</b><p className="my-1.5 leading-[1.5] wrap-anywhere">{report.target_preview.caption || report.target_preview.body || (report.target_preview.social_public === false ? 'Conta privada' : '')}</p>{report.target_preview.image_url && <img className="my-2 block aspect-square w-[min(100%,220px)] object-cover" src={apiUrl(report.target_preview.image_url)} alt="Imagem da publicação denunciada" />}</div>}
      {status === 'pending' && <><label htmlFor={`decision-${report.id}`}>Decisão</label><select className={adminSelect} id={`decision-${report.id}`} value={decisions[report.id]?.action ?? (report.target_type === 'user' ? 'suspend' : 'dismiss')} onChange={event => setDecisions(old => ({ ...old, [report.id]: { action: event.target.value, justification: old[report.id]?.justification ?? '' } }))}><option value="dismiss">Dispensar denúncia</option>{report.target_type !== 'user' && <option value="remove">{report.target_type === 'match_message' ? 'Remover mensagem' : 'Remover conteúdo'}</option>}<option value="suspend">Suspender conta responsável</option>{report.target_type === 'user' && <option value="reactivate">Reativar conta</option>}</select>{report.target_type === 'match_message' && (decisions[report.id]?.action ?? 'dismiss') === 'remove' && <p className="mt-1.5 text-[11px] leading-[1.5] text-ink-muted" role="status">O texto some para todos na partida; o registro fica guardado com a denúncia.</p>}<label htmlFor={`justification-${report.id}`}>Justificativa obrigatória</label><textarea id={`justification-${report.id}`} className={cn(adminTextarea, 'aria-invalid:border-error')} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} aria-invalid={Boolean(problems[report.id])} aria-describedby={problems[report.id] ? `justification-${report.id}-error` : undefined} onChange={event => setJustification(report, decisions[report.id]?.action ?? defaultAction(report), event.target.value)} />{problems[report.id] && <p id={`justification-${report.id}-error`} className={errorClass} role="alert">{problems[report.id]}</p>}{formError(report)}<Button className="mt-[18px] min-h-10 w-full" disabled={busy} onClick={() => void decide(report)}>Registrar decisão</Button></>}
      {status === 'resolved' && report.target_user_id && report.target_user_active === false && <>
        <p>Conta responsável suspensa · #{report.target_user_id}</p>
        <label htmlFor={`reactivate-${report.id}`}>Justificativa para reativação</label>
        <textarea id={`reactivate-${report.id}`} className={cn(adminTextarea, 'aria-invalid:border-error')} value={decisions[report.id]?.justification ?? ''} maxLength={1000} rows={2} aria-invalid={Boolean(problems[report.id])} aria-describedby={problems[report.id] ? `reactivate-${report.id}-error` : undefined} onChange={event => setJustification(report, 'reactivate', event.target.value)} />
        {problems[report.id] && <p id={`reactivate-${report.id}-error`} className={errorClass} role="alert">{problems[report.id]}</p>}
        {formError(report)}
        <Button className="mt-[18px] min-h-10 w-full" disabled={busy} onClick={() => void reactivate(report)}>Reativar conta</Button>
      </>}
    </article>)}
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais</Button>}
  </Card>
}
