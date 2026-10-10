import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { ApiError, request } from '../api/client'
import type { User } from '../api/client'
import Avatar from './Avatar'

async function cropImage(source: string, area: Area): Promise<Blob> {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o recorte.')
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o recorte.')), 'image/webp', 0.92))
}

export default function AvatarEditor({ user, onUser, onExpired }: {
  user: User
  onUser: (user: User) => void
  onExpired: () => void
}) {
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('foto-perfil.webp')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])

  function choose(file?: File) {
    setError(''); setMessage('')
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter até 5 MiB.'); return }
    const next = URL.createObjectURL(file)
    setSource(next); setFileName(file.name || 'foto-perfil.webp'); setCrop({ x: 0, y: 0 }); setZoom(1)
  }
  async function save() {
    if (!source || !area) return
    setBusy(true); setError(''); setMessage('')
    try {
      const blob = await cropImage(source, area)
      const form = new FormData()
      form.append('file', blob, fileName.replace(/\.[^.]+$/, '') + '.webp')
      onUser(await request<User>('/me/avatar', 'PUT', form))
      setSource(''); setMessage('Foto de perfil atualizada.')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a foto.')
    } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(''); setMessage('')
    try {
      await request<void>('/me/avatar', 'DELETE')
      onUser({ ...user, avatar: null }); setMessage('Foto de perfil removida.')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a foto.')
    } finally { setBusy(false) }
  }
  return <section className="avatar-editor" aria-labelledby="avatar-heading">
    <div className="avatar-editor-current"><Avatar key={user.avatar?.id ?? 'initials'} user={user} className="avatar-editor-preview" /><div><h3 id="avatar-heading">Foto de perfil</h3><p>JPEG, PNG ou WebP · até 5 MiB</p></div></div>
    <label className="secondary avatar-file-button" htmlFor="avatar-file">{user.avatar ? 'Trocar foto' : 'Adicionar foto'}</label>
    <input id="avatar-file" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }} />
    {user.avatar && <button className="text-button avatar-remove" type="button" disabled={busy} onClick={() => void remove()}>Remover foto</button>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    {source && <div className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <div className="crop-panel"><h3 id="crop-title">Ajustar foto</h3><p>Arraste a imagem e ajuste o zoom para escolher o recorte quadrado.</p>
        <div className="crop-area"><Cropper image={source} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div>
        <label htmlFor="avatar-zoom">Zoom</label><input id="avatar-zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button className="secondary" type="button" disabled={busy} onClick={() => setSource('')}>Cancelar</button><button className="primary" type="button" disabled={busy || !area} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar foto'}</button></div>
      </div>
    </div>}
  </section>
}
