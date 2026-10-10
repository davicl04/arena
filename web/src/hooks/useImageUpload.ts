import { useEffect, useState } from 'react'
import type { Area } from 'react-easy-crop'
import { request } from '../api/client'
import type { User } from '../api/client'
import { cropImage, validateImageFile } from '../utils/cropImage'
import { useSubmit } from './useSubmit'

interface Options {
  path: string
  fallbackName: string
  maxWidth?: number
  maxHeight?: number
  quality?: number
  failure: string
  onUser: (user: User) => void
  onExpired: () => void
  onSaved: () => void
}

/** Escolha de arquivo, recorte e envio multipart (`file`) para uma rota de imagem do titular. */
export function useImageUpload({ path, fallbackName, maxWidth, maxHeight, quality, failure, onUser, onExpired, onSaved }: Options) {
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState(fallbackName)
  const { busy, error, setError, run } = useSubmit(onExpired)
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  function choose(file?: File) {
    setError('')
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) { setError(invalid); return }
    setFileName(file.name || fallbackName); setSource(URL.createObjectURL(file))
  }
  async function save(area: Area) {
    const saved = await run(async () => {
      const blob = await cropImage(source, area, { maxWidth, maxHeight, quality })
      const form = new FormData()
      form.append('file', blob, `${fileName.replace(/\.[^.]+$/, '')}.webp`)
      onUser(await request<User>(path, 'PUT', form))
      return true
    }, failure)
    if (saved) { setSource(''); onSaved() }
  }
  return { source, busy, error, choose, cancel: () => { setSource(''); setError('') }, save }
}
