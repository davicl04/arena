import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { getShareData } from '@/api/share'
import type { ShareTarget } from '@/api/share'
import { Button, IconButton } from '@/components/ui/button'
import { useDialogContainer } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'
import { toast } from '@/components/ui/toast'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useResource } from '@/hooks/useResource'
import { drawSticker, downloadBlob, measuredLayout, prepareSticker, stickerPng } from './stickerCanvas'
import { stickerContent } from './stickerContent'
import type { StickerContent } from './stickerContent'
import { STICKER_HEIGHT, STICKER_WIDTH } from './stickerLayout'

/** Largura da prévia quando o espaço disponível ainda não foi medido. */
const FALLBACK_WIDTH = 288

/** Maior caixa 9:16 que cabe no espaço da prévia. */
function fitStory(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return FALLBACK_WIDTH
  return Math.floor(Math.min(width, (height * STICKER_WIDTH) / STICKER_HEIGHT))
}

/**
 * Prévia 9:16 do Story: o mesmo desenho da exportação (`drawSticker`), escalado ao espaço da tela e à densidade de
 * pixels, sobre o xadrez escuro do fundo transparente. O Canvas é uma imagem com o adesivo por extenso no rótulo.
 */
function StickerPreview({ content }: { content: StickerContent }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => setWidth(fitStory(frame.clientWidth, frame.clientHeight))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let alive = true
    void prepareSticker().then(assets => {
      const canvas = canvasRef.current
      const ctx = alive ? canvas?.getContext('2d') : null
      if (!canvas || !ctx) return
      const ratio = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(((width * STICKER_HEIGHT) / STICKER_WIDTH) * ratio)
      drawSticker(ctx, measuredLayout(ctx, content), assets, { scale: canvas.width / STICKER_WIDTH, background: 'checker' })
    })
    return () => { alive = false }
  }, [content, width])
  return <div ref={frameRef} data-slot="story-frame" className="grid size-full min-h-0 place-items-center">
    <canvas ref={canvasRef} role="img" aria-label={content.spoken} data-slot="story-preview"
      className="block rounded-[20px] shadow-[0_10px_30px_rgb(0_0_0/0.35)]"
      style={{ width, height: Math.round((width * STICKER_HEIGHT) / STICKER_WIDTH) }} />
  </div>
}

/** Nome do PNG do adesivo: "arena-adesivo-partida-50.png". */
const stickerFileName = (target: ShareTarget) => `arena-adesivo-${target.kind}-${target.id}.png`

/**
 * Tela imersiva de compartilhar nos Stories (rodada 7 do protótipo): fundo `night` igual nos dois temas, o fechar e o
 * título "Prévia do Story" no topo, a prévia 9:16 no meio e, embaixo, "Salvar só o adesivo" (PNG 1080×1920 de fundo
 * transparente). Uma leitura de `/me/share/...` por abertura; 401 segue o fluxo de sessão expirada e 404 explica que a
 * atividade não está disponível. Entra na moldura do app por portal, acima da navegação, com o foco preso e Escape.
 */
export function ShareStoryScreen({ target, onClose, onExpired }: { target: ShareTarget; onClose: () => void; onExpired: () => void }) {
  const container = useDialogContainer()
  const titleId = useId()
  const { kind, id } = target
  const load = useCallback(() => getShareData({ kind, id }), [kind, id])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar os dados do adesivo.' })
  const content = useMemo(() => (resource.data ? stickerContent(resource.data) : null), [resource.data])
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  const [saving, setSaving] = useState(false)
  const notFound = resource.errorCause instanceof ApiError && resource.errorCause.status === 404
  const expired = resource.errorCause instanceof ApiError && resource.errorCause.status === 401

  async function saveSticker() {
    if (!content || saving) return
    setSaving(true)
    try {
      downloadBlob(await stickerPng(content), stickerFileName({ kind, id }))
      toast.success('Imagem salva', { description: 'O adesivo foi baixado em PNG com fundo transparente.' })
    } catch {
      toast.error('Não foi possível salvar o adesivo', { description: 'Tente de novo em instantes.' })
    } finally {
      setSaving(false)
    }
  }

  let body
  if (resource.loading || expired) {
    body = <div role="status" className="grid justify-items-center gap-3 text-[12px] text-white/70">
      <span aria-hidden="true" className="aspect-[9/16] w-[180px] rounded-[20px] bg-white/8 motion-safe:animate-pulse" />
      Carregando o adesivo…
    </div>
  } else if (notFound) {
    body = <div role="alert" className="grid max-w-[30ch] justify-items-center gap-2 px-6 text-center">
      <h2 className="font-display text-[16px] text-white">Atividade não encontrada</h2>
      <p className="m-0 text-[12px] leading-[1.6] text-white/65">Ela não está mais disponível para compartilhar. Volte à linha do tempo e escolha outra.</p>
      <Button type="button" variant="glass" className="mt-2" onClick={onClose}>Voltar às partidas</Button>
    </div>
  } else if (resource.error || !content) {
    body = <LoadError size="screen" tone="dark" title="Não foi possível carregar o adesivo" text={resource.error}
      cause={resource.errorCause} retryLabel="Tentar de novo" onRetry={resource.reload} />
  } else {
    body = <StickerPreview content={content} />
  }

  const screen = <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
    data-slot="share-story" className="escuro-por-design absolute inset-0 z-glass-screen flex flex-col bg-night text-white outline-none">
    <header className="flex min-h-[58px] flex-none items-center justify-between gap-2 px-2.5 pt-2 pb-1">
      <IconButton tone="glass" aria-label="Fechar" data-autofocus className="focus-visible:outline-mint" onClick={onClose}><X size={21} /></IconButton>
      <h1 id={titleId} className="text-[14px] font-semibold text-[#cfdad3]">Prévia do Story</h1>
      <span className="w-11" aria-hidden="true" />
    </header>
    <div aria-busy={resource.loading} className="grid min-h-0 flex-1 place-items-center px-4 py-2">{body}</div>
    {content && <div className="grid flex-none gap-2.5 px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
      {/* Ocupado sem `disabled`: o botão desabilitado perderia o foco (e o Escape deixaria de fechar a tela). */}
      <Button type="button" variant="glass" className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] text-[14px] aria-disabled:opacity-60"
        aria-disabled={saving} aria-busy={saving} onClick={() => void saveSticker()}>
        <Download size={19} aria-hidden="true" />{saving ? 'Gerando imagem…' : 'Salvar só o adesivo'}
      </Button>
      <p className="m-0 text-center text-[11px] leading-normal text-white/60">PNG 1080×1920 com fundo transparente, para pôr sobre a sua foto no Instagram.</p>
    </div>}
  </section>
  return container ? createPortal(screen, container) : screen
}
