import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, ImagePlus, Share2, Sticker, X, ZoomIn, ZoomOut } from 'lucide-react'
import { ApiError } from '@/api/client'
import { getShareData } from '@/api/share'
import type { ShareTarget } from '@/api/share'
import { Segmented } from '@/components/results/Stepper'
import { Button, IconButton } from '@/components/ui/button'
import { useDialogContainer } from '@/components/ui/dialog'
import { LoadError } from '@/components/ui/load-error'
import { overlayScrim, widePanel } from '@/components/ui/overlay-variants'
import { toast } from '@/components/ui/toast'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useWideLayout } from '@/hooks/useLayout'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/lib/utils'
import { downloadBlob, shareOrDownload, stickerPng, storyJpeg } from './stickerCanvas'
import { stickerContent } from './stickerContent'
import type { PlatePosition } from './stickerLayout'
import { INITIAL_FRAMING, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, zoomBy } from './storyFraming'
import type { Framing } from './storyFraming'
import { loadPhoto, PhotoError } from './storyPhoto'
import type { StoryPhoto } from './storyPhoto'
import { StoryPreview } from './StoryPreview'

/** Nome do PNG do adesivo: "arena-adesivo-partida-50.png". */
const stickerFileName = (target: ShareTarget) => `arena-adesivo-${target.kind}-${target.id}.png`
/** Nome do JPEG do Story montado: "arena-story-partida-50.jpg". */
const storyFileName = (target: ShareTarget) => `arena-story-${target.kind}-${target.id}.jpg`

const POSITIONS: readonly { value: PlatePosition; label: string }[] = [
  { value: 'topo', label: 'Topo' }, { value: 'centro', label: 'Centro' }, { value: 'base', label: 'Base' },
]

/** O que está ocupado: abrir a foto ou gerar um dos arquivos. */
type Busy = 'photo' | 'share' | 'download' | 'sticker' | null

/** Ação pequena da tela (ícone sobre o rótulo), como no protótipo. */
function SmallAction({ icon, label, busyLabel, busy, blocked, disabled, onClick }: {
  icon: ReactNode; label: string; busyLabel: string; busy: boolean; blocked: boolean; disabled?: boolean; onClick: () => void
}) {
  return <button type="button" disabled={disabled} aria-disabled={blocked} aria-busy={busy || undefined} onClick={onClick}
    className="grid min-h-11 min-w-[64px] justify-items-center gap-1 rounded-[10px] border-0 bg-transparent px-1 py-1 text-[11.5px] font-semibold text-[#cfdad3] focus-visible:outline-mint enabled:hover:bg-white/8 disabled:opacity-45 aria-disabled:opacity-60">
    {icon}{busy ? busyLabel : label}
  </button>
}

/**
 * Tela imersiva de compartilhar nos Stories (rodada 7 do protótipo, com o editor da especificação): fundo `night` igual
 * nos dois temas, o fechar e o título "Prévia do Story" no topo e a prévia 9:16 no meio. Sem foto, a prévia mostra o
 * adesivo sobre o xadrez do fundo transparente e "Escolher foto"; com foto, a foto cobre o quadro e pode ser enquadrada.
 * Embaixo: a posição da placa (Topo, Centro, Base) com o zoom, "Compartilhar imagem" (menta, desabilitado sem foto) e as
 * ações pequenas "Baixar imagem", "Trocar foto" e "Salvar só o adesivo". O Story montado é um JPEG 1080×1920; o adesivo,
 * um PNG 1080×1920 transparente com a placa na posição escolhida. Uma leitura de `/me/share/...` por abertura; 401 segue o
 * fluxo de sessão expirada e 404 explica que a atividade não está disponível. A foto fica só no navegador. Entra na
 * moldura do app por portal, acima da navegação, com o foco preso e Escape. Em tablet e computador (ticket 02 da web
 * responsiva), painel centralizado de 480 px sobre o fundo escurecido; a prévia 9:16 segue a altura do painel.
 */
export function ShareStoryScreen({ target, onClose, onExpired }: { target: ShareTarget; onClose: () => void; onExpired: () => void }) {
  const container = useDialogContainer()
  const wide = useWideLayout()
  const titleId = useId()
  const { kind, id } = target
  const load = useCallback(() => getShareData({ kind, id }), [kind, id])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar os dados do adesivo.' })
  const content = useMemo(() => (resource.data ? stickerContent(resource.data) : null), [resource.data])
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  const fileRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState<PlatePosition>('topo')
  const [photo, setPhoto] = useState<StoryPhoto | null>(null)
  const [framing, setFraming] = useState<Framing>(INITIAL_FRAMING)
  const [busy, setBusy] = useState<Busy>(null)
  const notFound = resource.errorCause instanceof ApiError && resource.errorCause.status === 404
  const expired = resource.errorCause instanceof ApiError && resource.errorCause.status === 401

  /** Roda uma exportação por vez, com o botão dela ocupado. */
  async function run(what: Exclude<Busy, null>, task: () => Promise<void>) {
    if (busy) return
    setBusy(what)
    try { await task() } finally { setBusy(null) }
  }

  function choosePhoto() {
    if (!busy) fileRef.current?.click()
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Limpa o campo para que escolher o mesmo arquivo de novo também dispare a troca.
    input.value = ''
    if (!file) return
    await run('photo', async () => {
      try {
        const next = await loadPhoto(file)
        // Trocar a foto recomeça o enquadramento; a posição da placa continua a mesma.
        setPhoto(next)
        setFraming(INITIAL_FRAMING)
      } catch (error) {
        toast.error('Não foi possível usar esta foto', {
          description: error instanceof PhotoError ? error.message : 'Escolha outra foto (JPEG, PNG ou WebP).',
        })
      }
    })
  }

  /** Story montado em JPEG, ou `null` (com o aviso) quando o arquivo não pôde ser gerado. */
  async function story(): Promise<Blob | null> {
    if (!content || !photo) return null
    try {
      return await storyJpeg(content, position, photo, framing)
    } catch {
      toast.error('Não foi possível gerar a imagem', { description: 'Tente de novo em instantes.' })
      return null
    }
  }

  const shareStory = () => run('share', async () => {
    const blob = await story()
    if (!blob) return
    try {
      const result = await shareOrDownload(blob, storyFileName({ kind, id }))
      if (result === 'downloaded') {
        toast.info('Imagem baixada', { description: 'Este navegador não compartilha arquivos. O Story foi baixado em JPEG para você publicar no Instagram.' })
      }
    } catch {
      toast.error('Não foi possível compartilhar a imagem', { description: 'Tente de novo ou use “Baixar imagem”.' })
    }
  })

  const downloadStory = () => run('download', async () => {
    const blob = await story()
    if (!blob) return
    downloadBlob(blob, storyFileName({ kind, id }))
    toast.success('Imagem salva', { description: 'O Story foi baixado em JPEG 1080×1920.' })
  })

  const saveSticker = () => run('sticker', async () => {
    if (!content) return
    try {
      downloadBlob(await stickerPng(content, position), stickerFileName({ kind, id }))
      toast.success('Imagem salva', { description: 'O adesivo foi baixado em PNG com fundo transparente.' })
    } catch {
      toast.error('Não foi possível salvar o adesivo', { description: 'Tente de novo em instantes.' })
    }
  })

  const zoom = (factor: number) => {
    if (photo) setFraming(current => zoomBy(current, factor, photo))
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
    body = <StoryPreview content={content} position={position} photo={photo} framing={framing} onFraming={setFraming} busy={busy !== null}
      empty={<Button type="button" variant="glass" aria-disabled={busy === 'photo' || undefined} aria-busy={busy === 'photo' || undefined}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[13px] shadow-[0_6px_18px_rgb(0_0_0/0.35)] focus-visible:outline-white aria-disabled:opacity-60"
        onClick={choosePhoto}><ImagePlus size={18} aria-hidden="true" />{busy === 'photo' ? 'Abrindo a foto…' : 'Escolher foto'}</Button>} />
  }

  const working = busy !== null
  const atMin = !photo || framing.zoom <= MIN_ZOOM
  const atMax = !photo || framing.zoom >= MAX_ZOOM

  const screen = <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
    data-slot="share-story" className={cn('escuro-por-design absolute inset-0 z-glass-screen flex flex-col bg-night text-white outline-none', widePanel, 'md:overflow-hidden')}>
    <header className="flex min-h-[58px] flex-none items-center justify-between gap-2 px-2.5 pt-2 pb-1">
      <IconButton tone="glass" aria-label="Fechar" data-autofocus className="focus-visible:outline-mint" onClick={onClose}><X size={21} /></IconButton>
      <h1 id={titleId} className="text-[14px] font-semibold text-[#cfdad3]">Prévia do Story</h1>
      <span className="w-11" aria-hidden="true" />
    </header>
    <div aria-busy={resource.loading} className="grid min-h-0 flex-1 place-items-center px-4 py-2">{body}</div>
    {content && <div className="grid flex-none gap-2.5 px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
      <input ref={fileRef} type="file" accept="image/*" aria-label="Foto do Story" tabIndex={-1} className="sr-only" onChange={event => void onFile(event)} />
      <div className="flex items-center gap-2">
        <Segmented tone="night" label="Posição da placa" items={POSITIONS} value={position} onChange={setPosition} className="min-w-0 flex-1" />
        <div role="group" aria-label="Zoom da foto" className="flex flex-none gap-0.5">
          {/* No limite, `aria-disabled` em vez de `disabled`: o botão focado não perde o foco (nem o Escape). */}
          <IconButton tone="glass" aria-label="Reduzir a foto" disabled={!photo} aria-disabled={atMin || undefined}
            className="focus-visible:outline-mint disabled:opacity-35 aria-disabled:opacity-35" onClick={() => { if (!atMin) zoom(1 / ZOOM_STEP) }}><ZoomOut size={19} aria-hidden="true" /></IconButton>
          <IconButton tone="glass" aria-label="Ampliar a foto" disabled={!photo} aria-disabled={atMax || undefined}
            className="focus-visible:outline-mint disabled:opacity-35 aria-disabled:opacity-35" onClick={() => { if (!atMax) zoom(ZOOM_STEP) }}><ZoomIn size={19} aria-hidden="true" /></IconButton>
        </div>
      </div>
      {/* Ocupado sem `disabled`: o botão desabilitado perderia o foco (e o Escape deixaria de fechar a tela). */}
      <Button type="button" variant="glass" disabled={!photo} aria-disabled={working} aria-busy={busy === 'share' || undefined}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] text-[14px] focus-visible:outline-white aria-disabled:opacity-60"
        onClick={() => void shareStory()}>
        <Share2 size={19} aria-hidden="true" />{busy === 'share' ? 'Gerando imagem…' : 'Compartilhar imagem'}
      </Button>
      <div className="flex flex-wrap justify-center gap-x-1 gap-y-1 min-[360px]:gap-x-4">
        <SmallAction icon={<Download size={19} aria-hidden="true" />} label="Baixar imagem" busyLabel="Gerando…" busy={busy === 'download'}
          blocked={working} disabled={!photo} onClick={() => void downloadStory()} />
        <SmallAction icon={<ImagePlus size={19} aria-hidden="true" />} label="Trocar foto" busyLabel="Abrindo…" busy={busy === 'photo'}
          blocked={working} disabled={!photo} onClick={choosePhoto} />
        <SmallAction icon={<Sticker size={19} aria-hidden="true" />} label="Salvar só o adesivo" busyLabel="Gerando imagem…" busy={busy === 'sticker'}
          blocked={working} onClick={() => void saveSticker()} />
      </div>
    </div>}
  </section>
  const overlay = wide ? <><div data-slot="overlay-scrim" aria-hidden="true" className={overlayScrim} />{screen}</> : screen
  return container ? createPortal(overlay, container) : overlay
}
