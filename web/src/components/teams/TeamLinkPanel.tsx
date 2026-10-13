import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, RefreshCw, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { regenerateLink, teamLink } from '@/api/teams'
import { IconButton } from '@/components/ui/button'
import { useResource } from '@/hooks/useResource'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { darkNotice, teamButton } from './styles'

/**
 * Link e QR do time (Q2/Q5): QR em SVG, link com copiar e compartilhar e "Gerar outro link", com confirmação. O link
 * não expira; gerar outro invalida o anterior na hora. Se a cópia falhar, o link aparece num campo selecionado.
 */
export function TeamLinkPanel({ teamId, teamName, onExpired }: { teamId: number; teamName: string; onExpired: () => void }) {
  const loaded = useResource(useCallback(() => teamLink(teamId), [teamId]), onExpired, { fallback: 'Não foi possível carregar o link do time.' })
  const { data: link, error: loadError, setData: setLink } = loaded
  const [notice, setNotice] = useState('')
  const [manual, setManual] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const regenerate = useSubmit(onExpired)
  const manualRef = useRef<HTMLInputElement>(null)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // Cópia manual: o campo recebe o foco já selecionado, pronto para Ctrl+C (ou o menu de copiar no celular).
  useEffect(() => {
    if (!manual) return
    manualRef.current?.focus()
    manualRef.current?.select()
  }, [manual, link])

  async function copy() {
    if (!link) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sem área de transferência')
      await navigator.clipboard.writeText(link.url)
      setManual(false); setNotice('Link copiado.')
    } catch {
      setManual(true); setNotice('Não foi possível copiar. Selecione o link abaixo e copie.')
    }
  }
  async function share() {
    if (!link) return
    try {
      await navigator.share({ title: `Entrar no ${teamName}`, text: `Peça para entrar no ${teamName} no Arena.`, url: link.url })
    } catch (cause) {
      // Fechar a folha de compartilhamento não é erro; outras falhas caem para a cópia manual.
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) { setManual(true); setNotice('Não foi possível compartilhar. Selecione o link abaixo e copie.') }
    }
  }
  async function renew() {
    const value = await regenerate.run(() => regenerateLink(teamId), 'Não foi possível gerar outro link.')
    if (value) { setLink(value); setConfirming(false); setManual(false); setNotice('Novo link gerado. O anterior não vale mais.') }
  }

  return <div className="mt-3.5 grid justify-items-center gap-3 rounded-[18px] bg-white/5 px-4 py-[18px] text-center text-white shadow-[inset_0_0_0_1px_#ffffff1c]">
    {!link ? (loadError
      ? <div role="alert" className={cn(darkNotice({ tone: 'error' }), 'mt-0 w-full')}>{loadError}
        <button type="button" className="ml-1 border-0 bg-transparent p-0 font-bold text-mint underline" onClick={loaded.reload}>Tentar novamente</button></div>
      : <p role="status" className="py-10 text-[12px] text-white/66">Carregando o link do time…</p>)
      : <>
        <div className="rounded-[14px] bg-white p-2.5">
          <QRCodeSVG value={link.url} size={168} level="M" marginSize={0} fgColor="#0b2218" title={`Código QR para entrar no ${teamName}`} role="img" aria-label={`Código QR para entrar no ${teamName}`} />
        </div>
        <div className="flex w-full min-w-0 items-center gap-1 rounded-xl bg-white/7 py-1.5 pr-1.5 pl-3">
          <code className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px] font-semibold text-mint" title={link.url}>{link.url.replace(/^https?:\/\//, '')}</code>
          <IconButton type="button" tone="glass" className="size-9" aria-label="Copiar link" onClick={() => void copy()}><Copy size={18} /></IconButton>
          {canShare && <IconButton type="button" tone="glass" className="size-9" aria-label="Compartilhar link" onClick={() => void share()}><Share2 size={18} /></IconButton>}
        </div>
        {manual && <>
          <label htmlFor="team-link-manual" className="sr-only">Link do time</label>
          <input id="team-link-manual" ref={manualRef} readOnly value={link.url} onFocus={event => event.currentTarget.select()}
            className="min-h-10 rounded-[10px] border-white/18 bg-white/5 px-2.5 py-2 font-mono text-[11px] text-white" />
        </>}
        <p role="status" aria-live="polite" className={cn('text-[11px] font-semibold text-mint', !notice && 'sr-only')}>{notice}</p>
        <small className="text-[10.5px] leading-[1.5] text-white/66">Quem escanear ou abrir o link pede para entrar, e um representante aprova. O link vale até alguém gerar outro.</small>
        {confirming
          ? <div className="w-full rounded-[14px] bg-white/7 p-3 text-left text-[11.5px] leading-[1.5]" role="group" aria-label="Confirmar novo link">
            <b className="block">Gerar outro link?</b>
            O link e o QR atuais deixam de valer na hora. Pedidos já enviados continuam esperando a sua resposta.
            {regenerate.error && <p className={darkNotice({ tone: 'error' })} role="alert">{regenerate.error}</p>}
            <div className="mt-2.5 flex gap-2 *:flex-1">
              <button type="button" className={teamButton()} disabled={regenerate.busy} onClick={() => void renew()}>{regenerate.busy ? 'Gerando…' : 'Gerar outro link'}</button>
              <button type="button" className={teamButton({ tone: 'line' })} disabled={regenerate.busy} onClick={() => setConfirming(false)}>Cancelar</button>
            </div>
          </div>
          : <button type="button" className={teamButton({ tone: 'line' })} onClick={() => setConfirming(true)}><RefreshCw aria-hidden="true" />Gerar outro link</button>}
      </>}
  </div>
}
