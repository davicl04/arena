import { useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'

/** Recorte redondo 1:1, quadrado ou retangular (ex.: 5:2) numa folha inferior. */
export default function ImageCropSheet({ source, title, description, aspect, round = false, confirmLabel, busy, error, onCancel, onConfirm }: {
  source: string
  title: string
  description: string
  aspect: number
  round?: boolean
  confirmLabel: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (area: Area) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  return <Sheet title={title} description={description} onClose={() => { if (!busy) onCancel() }}>
    {/* A proporção vem da folha que abriu o recorte (valor dinâmico). */}
    <div className="relative mx-auto my-3.5 aspect-square w-full max-w-[360px] overflow-hidden rounded-xl bg-[#202622]" style={{ aspectRatio: String(aspect) }}>
      <Cropper image={source} crop={crop} zoom={zoom} aspect={aspect} cropShape={round ? 'round' : 'rect'} showGrid={false}
        onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
    </div>
    <label htmlFor="crop-zoom">Zoom</label>
    {/* Zoom: base global de input sem padding, com a margem padrão do controle deslizante (2 px, zerada pelo preflight). */}
    <input id="crop-zoom" className="m-0.5 min-h-8 p-0 accent-brand" type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
    <SheetActions>
      <Button variant="secondary" type="button" disabled={busy} onClick={onCancel}>Cancelar</Button>
      <Button type="button" disabled={busy || !area} onClick={() => area && onConfirm(area)}>{busy ? 'Salvando…' : confirmLabel}</Button>
    </SheetActions>
  </Sheet>
}
