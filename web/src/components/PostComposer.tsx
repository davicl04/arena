import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { ArrowLeft, ArrowRight, Check, Crosshair, ImagePlus, RotateCcw, RotateCwSquare, X } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { Post } from '../api/client'
import { CAPTION_MAX } from '../api/social'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { cropImage, IMAGE_TYPES, validateImageFile } from '../utils/cropImage'
import { Button, IconButton } from '@/components/ui/button'
import { glassMessageVariants } from '@/components/ui/glass-variants'
import { GlassTextarea } from '@/components/ui/glass'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type Step = 'pick' | 'crop' | 'caption'
const ZOOMS = [1, 1.5, 2, 3]
const zoomLabel = (zoom: number) => `${zoom.toFixed(1).replace('.', ',').replace(',0', '')}×`
/* Painel de vidro embaixo da tela e botões escuros com contorno (Centralizar, Redefinir, Girar). */
const panel = 'm-2.5 mt-0 grid shrink-0 gap-2.5 rounded-[20px] bg-glass p-3 backdrop-blur-[16px] pb-[calc(12px+env(safe-area-inset-bottom))]'
const ghost = 'inline-flex min-h-[34px] items-center gap-1.5 rounded-[11px] border border-solid border-[#ffffff30] bg-transparent px-[11px] text-[11px] font-semibold text-white hover:bg-[#ffffff14]'
const wide = 'min-h-[46px] w-full text-[13px]'

/** Indicador "① Recorte · ② Legenda"; com o recorte concluído, tocar nele volta ao passo 1. */
function Steps({ step, onCrop }: { step: 'crop' | 'caption'; onCrop: () => void }) {
  const done = step === 'caption'
  const dot = 'grid size-5 place-items-center rounded-full border-[1.5px] border-solid border-current text-[10px] not-italic'
  return <ol className="flex flex-1 items-center justify-center gap-2 text-[11px] font-bold text-[#ffffff80]" aria-label="Etapas da publicação">
    <li aria-current={done ? undefined : 'step'}>
      <button type="button" className={cn('inline-flex items-center gap-1.5 border-0 bg-transparent p-1 text-inherit', done ? 'cursor-pointer' : 'cursor-default text-white')}
        disabled={!done} onClick={onCrop} aria-label={done ? 'Recorte concluído: voltar ao recorte' : undefined}>
        <i className={cn(dot, done ? 'border-transparent bg-[#ffffff26] text-mint' : 'border-mint bg-mint text-night')}>{done ? <Check size={12} /> : '1'}</i>Recorte
      </button>
    </li>
    <li aria-hidden="true" className="h-px w-[22px] bg-[#ffffff40]" />
    <li aria-current={done ? 'step' : undefined} className={cn('inline-flex items-center gap-1.5', done && 'text-white')}>
      <i className={cn(dot, done && 'border-mint bg-mint text-night')}>2</i>Legenda
    </li>
  </ol>
}

/**
 * Nova publicação em tela cheia escura (H5 + P2): escolher a foto, enquadrar (I5: atalhos de zoom, slider, girar,
 * centralizar e redefinir) e, no segundo passo, escrever a legenda e publicar. O recorte sai quadrado, como o servidor exige.
 */
export default function PostComposer({ onClose, onPublished, onExpired }: {
  onClose: () => void
  onPublished: (post: Post) => void
  onExpired: () => void
}) {
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose)
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<Area | null>(null)
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const completeCrop = useCallback((_: Area, pixels: Area) => setArea(pixels), [])

  // A cada passo, o foco vai para o controle principal (o botão que levou ao passo deixa de existir).
  useEffect(() => {
    const target = ref.current?.querySelector<HTMLElement>('[data-step-focus]:not(:disabled)')
    if (target) target.focus()
    else ref.current?.focus({ preventScroll: true })
  }, [step, ref])

  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])

  function choose(next?: File) {
    setError('')
    if (!next) return
    const invalid = validateImageFile(next)
    if (invalid) { setError(invalid); return }
    setFile(next); setSource(URL.createObjectURL(next))
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setImage(null); setStep('crop')
  }

  async function next() {
    if (!area || busy) return
    setBusy(true); setError('')
    try {
      const blob = await cropImage(source, area, { rotation, quality: 0.88, maxWidth: 1080, maxHeight: 1080 })
      setImage({ blob, url: URL.createObjectURL(blob) }); setStep('caption')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o recorte.')
    } finally { setBusy(false) }
  }

  async function publish() {
    if (!image || !file || busy) return
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', image.blob, `${file.name.replace(/\.[^.]+$/, '')}.webp`)
      form.append('caption', caption)
      onPublished(await request<Post>('/posts', 'POST', form))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível publicar.')
      setBusy(false)
    }
  }

  const message = error && <p className={glassMessageVariants()} role="alert">{error}</p>
  return <section ref={ref} className="absolute inset-0 z-sheet flex flex-col bg-black text-white outline-none motion-safe:animate-viewer-in"
    role="dialog" aria-modal="true" aria-label="Nova publicação" tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="flex h-14 shrink-0 items-center gap-1 px-1.5">
      {step === 'caption'
        ? <IconButton type="button" tone="glass" aria-label="Voltar ao recorte" onClick={() => setStep('crop')}><ArrowLeft size={21} /></IconButton>
        : <IconButton type="button" tone="glass" aria-label="Fechar" onClick={onClose}><X size={21} /></IconButton>}
      {step === 'pick' ? <h2 className="flex-1 text-center text-[15px] text-white">Nova publicação</h2> : <Steps step={step} onCrop={() => setStep('crop')} />}
      <span className="w-11" />
    </header>

    {step === 'pick' && <div className="grid flex-1 place-items-center content-center gap-3 px-8 text-center">
      <label htmlFor="post-image" className="m-0 grid cursor-pointer justify-items-center gap-2.5 text-[12px] font-normal text-[#ffffffb3]">
        <ImagePlus size={34} className="text-mint" />
        <b className="font-display text-[15px] text-white">Escolher foto</b>
        JPG, PNG ou WebP. A original fica no seu dispositivo.
      </label>
      <input ref={picker} id="post-image" className="sr-only" type="file" accept={IMAGE_TYPES.join(',')} tabIndex={-1} aria-hidden="true"
        onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
      <Button type="button" variant="glass" data-step-focus onClick={() => picker.current?.click()}>Escolher foto</Button>
      {message}
    </div>}

    {step === 'crop' && <>
      <div className="relative min-h-0 flex-1">
        <Cropper image={source} crop={crop} zoom={zoom} rotation={rotation} aspect={1} minZoom={1} maxZoom={3}
          onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={completeCrop}
          style={{ containerStyle: { background: '#000' }, cropAreaStyle: { border: '2px solid #fff', borderRadius: 14, boxShadow: '0 0 0 9999em rgba(0, 0, 0, 0.66)' } }} />
      </div>
      <div className={panel}>
        <div className="flex items-center gap-2.5">
          <ToggleGroup className="flex-1 gap-1 rounded-xl bg-[#ffffff17] p-[3px]" aria-label="Zoom"
            value={ZOOMS.some(preset => Math.abs(preset - zoom) < 0.03) ? [String(ZOOMS.find(preset => Math.abs(preset - zoom) < 0.03))] : []}
            onValueChange={value => { if (value[0]) setZoom(Number(value[0])) }}>
            {ZOOMS.map(preset => <ToggleGroupItem key={preset} value={String(preset)}
              className="h-8 flex-1 rounded-[9px] text-[11.5px] font-bold text-[#ffffffb3] tabular-nums hover:bg-[#ffffff14] hover:text-white data-pressed:bg-mint data-pressed:text-night">
              {zoomLabel(preset)}</ToggleGroupItem>)}
          </ToggleGroup>
          <button type="button" className="grid size-[38px] shrink-0 place-items-center rounded-[11px] border border-solid border-[#ffffff30] bg-transparent text-white hover:bg-[#ffffff14]"
            aria-label="Girar 90 graus" title="Girar" onClick={() => setRotation(old => (old + 90) % 360)}><RotateCwSquare size={17} /></button>
        </div>
        <div className="flex items-center gap-2.5">
          <Slider className="flex-1 [&_[data-slot=slider-range]]:bg-mint [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-track]]:bg-[#ffffff33]"
            min={1} max={3} step={0.05} value={zoom} onValueChange={value => setZoom(Array.isArray(value) ? value[0] : value)} thumbLabel="Zoom" />
          <span className="min-w-[38px] text-right text-[12px] font-bold tabular-nums" aria-hidden="true">{zoom.toFixed(1).replace('.', ',')}×</span>
        </div>
        <div className="flex justify-center gap-2">
          <button type="button" className={ghost} onClick={() => setCrop({ x: 0, y: 0 })}><Crosshair size={15} />Centralizar</button>
          <button type="button" className={ghost} onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0) }}><RotateCcw size={15} />Redefinir</button>
        </div>
        {message}
        <Button type="button" variant="glass" data-step-focus className={cn(wide, 'inline-flex items-center justify-center gap-2')} disabled={!area || busy} onClick={() => void next()}>
          {busy ? 'Preparando…' : <>Continuar<ArrowRight size={17} /></>}
        </Button>
      </div>
    </>}

    {step === 'caption' && image && <>
      <div className="grid min-h-0 flex-1 place-items-center p-4">
        <img className="aspect-square max-h-full w-full max-w-[340px] rounded-[14px] object-cover" src={image.url} alt="Foto recortada" />
      </div>
      <div className={panel}>
        <label className="sr-only" htmlFor="post-caption">Legenda (opcional)</label>
        <GlassTextarea id="post-caption" data-step-focus className="min-h-24 resize-none" value={caption} maxLength={CAPTION_MAX} rows={4}
          placeholder="Conte um pouco sobre esse momento" aria-describedby="post-caption-count" disabled={busy} onChange={event => setCaption(event.target.value)} />
        <small id="post-caption-count" className="text-right text-[10px] text-[#ffffff99] tabular-nums">{caption.length}/2.200</small>
        {message}
        <Button type="button" variant="glass" className={wide} disabled={busy} onClick={() => void publish()}>{busy ? 'Publicando…' : 'Publicar'}</Button>
      </div>
    </>}
  </section>
}
