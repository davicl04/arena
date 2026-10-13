import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, QrCode, Search, SendHorizontal, UserPlus } from 'lucide-react'
import { getTeam, inviteCandidatesPath, sendInvite } from '@/api/teams'
import type { InviteCandidate, TeamStatus } from '@/api/teams'
import { Tabs } from '@/components/ui/tabs'
import { usePagedList } from '@/hooks/usePagedList'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { MemberFace } from './MemberFace'
import { darkNotice, groupLabel, teamButton } from './styles'
import { TeamIdCard } from './TeamIdCard'
import { TeamLinkPanel } from './TeamLinkPanel'
import { DarkTopBar, StepBars } from './TeamsPlate'

export type InviteTab = 'pessoa' | 'link'
const tabs = [
  { value: 'pessoa', label: 'Escolher atleta', Icon: UserPlus },
  { value: 'link', label: 'Link e QR', Icon: QrCode },
] as const
const MESSAGE_MAX = 140
const statusLabel: Record<Exclude<TeamStatus, 'disponivel'>, string> = { membro: 'No elenco', convite_pendente: 'Pendente', pedido_pendente: 'Pendente' }

/** Linha do candidato (.prow sobre o escuro): "No elenco", "Pendente" ou "Escolher". */
function CandidateRow({ candidate, onChoose }: { candidate: InviteCandidate; onChoose: () => void }) {
  const { person, team_status: status } = candidate
  return <li className="flex min-w-0 items-center gap-[11px] border-0 border-b border-solid border-white/8 py-2.5 last:border-b-0">
    <MemberFace name={person.name} avatarUrl={person.avatar_url} size="row" />
    <div className="min-w-0 flex-1 text-[12.5px] font-semibold text-white">
      <span className="block truncate">{person.name}</span>
      <small className="truncate text-[10.5px] font-medium text-white/56">@{person.username}</small>
    </div>
    {status === 'disponivel'
      ? <button type="button" className="min-h-9 border-0 bg-transparent px-1 text-[11.5px] font-bold text-mint" aria-label={`Escolher ${person.name}`} onClick={onChoose}>Escolher</button>
      : <span className="text-[10.5px] font-bold whitespace-nowrap text-white/45">{statusLabel[status]}</span>}
  </li>
}

/**
 * Convidar (I5 + Q2 + Q5), tela `team-invite`. Passo 1: abas Escolher atleta | Link e QR; a busca (nome ou @, espera de
 * 300 ms) parte de quem você segue. Passo 2: a carteirinha como o convidado vai ver e a mensagem opcional (até 140).
 * Depois de enviar, volta ao passo 1 com o aviso, para convidar mais gente.
 */
export function InviteFlow({ teamId, initialTab = 'pessoa', onClose, onExpired }: {
  teamId: number
  initialTab?: InviteTab
  onClose: () => void
  onExpired: () => void
}) {
  const { data: team, error: loadError } = useResource(useCallback(() => getTeam(teamId), [teamId]), onExpired, { fallback: 'Não foi possível carregar o time.' })
  const [tab, setTab] = useState<InviteTab>(initialTab)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<InviteCandidate | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const send = useSubmit(onExpired)
  const candidates = usePagedList<InviteCandidate>(inviteCandidatesPath(teamId, search), onExpired)

  // Busca com espera curta enquanto se digita; Enter busca na hora.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(query.trim())
  }
  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    if (!chosen) return
    const text = message.trim()
    const sent = await send.run(() => sendInvite(teamId, chosen.person.id, text || null), 'Não foi possível enviar o convite.')
    if (!sent) return
    candidates.setItems(items => items.map(item => item.person.id === chosen.person.id ? { ...item, team_status: 'convite_pendente' } : item))
    setNotice(`Convite enviado para ${chosen.person.name}.`)
    setChosen(null); setMessage('')
  }

  if (chosen) {
    const firstName = chosen.person.name.trim().split(/\s+/)[0]
    return <div className="min-h-full text-white">
      <DarkTopBar eyebrow="Passo 2 de 2" title="Revisar convite" onBack={() => { send.setError(''); setChosen(null) }} />
      <StepBars done={2} total={2} />
      <form className="px-4 pb-4" onSubmit={event => void submitInvite(event)}>
        <div className="mt-3.5 flex min-w-0 items-center gap-[11px] rounded-[14px] bg-white/5 p-[11px]">
          <MemberFace name={chosen.person.name} avatarUrl={chosen.person.avatar_url} size="row" />
          <div className="min-w-0 flex-1 text-[12.5px] font-bold">
            <span className="block truncate">{chosen.person.name}</span>
            <small className="truncate text-[10.5px] font-medium text-white/62">@{chosen.person.username}</small>
          </div>
        </div>
        <p className={cn(groupLabel, 'mt-[18px] mb-2 text-mint')} id="invite-preview-label">Como {firstName} vai ver</p>
        {team
          ? <div role="img" aria-labelledby="invite-preview-label" aria-describedby="invite-preview-text">
            <span id="invite-preview-text" className="sr-only">Carteirinha do {team.name} com o selo Convite e os botões Aceitar e Recusar.</span>
            <div aria-hidden="true">
              <TeamIdCard team={{ ...team, my_role: null }} highlight badge="Convite" line="Você, representante, convidou" showRoster={false}
                actions={<>
                  <span className={cn(teamButton(), 'flex-1 opacity-60')}><Check />Aceitar</span>
                  <span className={cn(teamButton({ tone: 'line' }), 'flex-1 opacity-60')}>Recusar</span>
                </>} />
            </div>
          </div>
          : <p role="status" className="text-[12px] text-white/66">{loadError || 'Carregando o time…'}</p>}
        <label htmlFor="invite-message" className={cn(groupLabel, 'mt-[18px] mb-2 text-mint')}>Mensagem (opcional)</label>
        <textarea id="invite-message" value={message} maxLength={MESSAGE_MAX} rows={3} aria-describedby="invite-message-count"
          placeholder="Ex.: jogamos society às quintas, 20h, no Sudoeste." onChange={event => setMessage(event.target.value)}
          className="block min-h-[84px] w-full resize-none rounded-control border border-solid border-white/14 bg-white/5 px-3 py-[11px] text-[12.5px] leading-[1.5] text-white placeholder:text-white/44 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint" />
        <small id="invite-message-count" className="mt-1 text-right text-[10px] text-white/50">{message.length}/{MESSAGE_MAX}<span className="sr-only"> caracteres</span></small>
        {send.error && <p className={darkNotice({ tone: 'error' })} role="alert">{send.error}</p>}
        <p role="status" aria-live="polite" className="sr-only">{send.busy ? 'Enviando convite…' : ''}</p>
        <button type="submit" className={cn(teamButton({ size: 'block' }), 'mt-3.5')} disabled={send.busy}>
          <SendHorizontal aria-hidden="true" />{send.busy ? 'Enviando…' : 'Enviar convite'}
        </button>
      </form>
    </div>
  }

  return <div className="min-h-full text-white">
    <DarkTopBar eyebrow="Passo 1 de 2" title="Quem você quer convidar?" icon="close" onBack={onClose} />
    <StepBars done={1} total={2} />
    <div className="px-4 pb-4">
      {team && <p className="mt-2 truncate text-[10.5px] text-white/56">Para o {team.name}</p>}
      <Tabs variant="pill" className="mt-3" items={tabs} value={tab} onChange={setTab} label="Como convidar" idPrefix="invite-tab-" controls="invite-panel" />
      <p role="status" aria-live="polite" className={cn(notice ? darkNotice() : 'sr-only')}>{notice}</p>
      <div id="invite-panel" role="tabpanel" aria-labelledby={`invite-tab-${tab}`}>
        {tab === 'link'
          ? <TeamLinkPanel teamId={teamId} teamName={team?.name ?? 'time'} onExpired={onExpired} />
          : <>
            <form role="search" className="mt-3" onSubmit={submitSearch}>
              <label htmlFor="invite-search" className="sr-only">Buscar atleta por nome ou @usuário</label>
              <div className="relative">
                <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/62" aria-hidden="true" />
                <input id="invite-search" type="search" autoComplete="off" maxLength={100} value={query} onChange={event => setQuery(event.target.value)}
                  placeholder="Nome ou @usuário" className="min-h-[42px] rounded-control border-white/14 bg-white/7 py-2.5 pl-9 text-[12.5px] text-white placeholder:text-white/50 focus-visible:outline-mint" />
              </div>
            </form>
            <p className={cn(groupLabel, 'text-white/56')}>{search ? 'Resultados' : 'Quem você segue'}</p>
            {candidates.loading ? <p role="status" className="py-3.5 text-[12px] text-white/66">Carregando atletas…</p>
              : candidates.error ? <div role="alert" className={darkNotice({ tone: 'error' })}>{candidates.error.message}
                <button type="button" className="ml-1 border-0 bg-transparent p-0 font-bold text-mint underline" onClick={candidates.reload}>Tentar novamente</button></div>
              : candidates.items.length === 0
                ? <p className="py-3.5 text-[11.5px] leading-[1.5] text-white/66">{search ? 'Ninguém com esse nome ou @usuário.' : 'Você ainda não segue ninguém aqui. Busque pelo nome ou @usuário.'}</p>
                : <ul className="m-0 list-none p-0" aria-label={search ? 'Resultados da busca' : 'Quem você segue'}>
                  {candidates.items.map(candidate => <CandidateRow key={candidate.person.id} candidate={candidate} onChoose={() => { setNotice(''); send.setError(''); setChosen(candidate) }} />)}
                </ul>}
            {candidates.moreError && <p className={darkNotice({ tone: 'error' })} role="alert">{candidates.moreError}</p>}
            {candidates.hasMore && <button type="button" className={cn(teamButton({ tone: 'line', size: 'md' }), 'mt-3 w-full')} disabled={candidates.busy}
              onClick={() => void candidates.loadMore()}>{candidates.busy ? 'Carregando…' : 'Carregar mais atletas'}</button>}
          </>}
      </div>
    </div>
  </div>
}
