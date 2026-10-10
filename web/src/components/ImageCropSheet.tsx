import { useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import BottomSheet from './BottomSheet'

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
  return <BottomSheet title={title} description={description} onClose={() => { if (!busy) onCancel() }}>
    <div className="crop-area" style={{ aspectRatio: String(aspect) }}>
      <Cropper image={source} crop={crop} zoom={zoom} aspect={aspect} cropShape={round ? 'round' : 'rect'} showGrid={false}
        onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
    </div>
    <label htmlFor="crop-zoom">Zoom</label>
    <input id="crop-zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions">
      <button className="secondary" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button className="primary" type="button" disabled={busy || !area} onClick={() => area && onConfirm(area)}>{busy ? 'Salvando…' : confirmLabel}</button>
    </div>
  </BottomSheet>
}
