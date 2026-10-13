import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import { LoadError } from './arena/LoadError'
import PostImage from './PostImage'
import type { PostUpdate } from './PostItem'
import PostViewer from './PostViewer'
import { Button } from './ui'
import { cx, tw } from '../styles'
import { useThemeColors } from '../hooks/useTheme'

/**
 * Grade de fotos 3×N de `/users/{id}/posts`, em linhas mapeadas (o perfil já rola num ScrollView).
 * É dona da lista e a compartilha com o visualizador "Publicações".
 * `onPostUpdate`/`onPostRemove` avisam quem mantém outra cópia do mesmo post (o feed da Comunidade).
 */
export default function ProfileGallery({ userId, ownerName, ownerUsername, viewerId, token, own = false, onNewPhoto, onPostUpdate, onPostRemove, onExpired }: {
  userId: number; ownerName: string; ownerUsername: string; viewerId: number; token: string | null; own?: boolean
  onNewPhoto?: () => void; onPostUpdate?: PostUpdate; onPostRemove?: (id: number) => void; onExpired: () => void
}) {
  const colors = useThemeColors()
  const list = usePagedList<Post>(`/users/${userId}/posts`, onExpired)
  const [open, setOpen] = useState<number | null>(null)
  const { setItems } = list
  const update: PostUpdate = useCallback((id, change) => {
    setItems(old => old.map(post => post.id === id ? change(post) : post))
    onPostUpdate?.(id, change)
  }, [setItems, onPostUpdate])
  const remove = useCallback((id: number) => {
    setItems(old => old.filter(post => post.id !== id))
    onPostRemove?.(id)
  }, [setItems, onPostRemove])
  const close = useCallback(() => setOpen(null), [])

  const viewer = open !== null ? <PostViewer list={list} index={open} username={ownerUsername} viewerId={viewerId} token={token} onUpdate={update} onRemove={remove} onClose={close} onExpired={onExpired} /> : null
  if (list.loading) return <ActivityIndicator accessibilityLabel="Carregando fotos" color={colors.brand} className="my-6" />
  if (list.error) return <LoadError size="section" title="Não foi possível carregar as fotos" text={list.error.message} cause={list.error} onRetry={list.reload} />
  // O visualizador continua montado quando a lista esvazia, para se fechar sozinho.
  if (!list.items.length) return <View className="items-center p-5.5">
    <Text accessibilityRole="header" className={cx(tw.heading, 'text-center')}>Nenhuma foto por aqui</Text>
    <Text className={cx(tw.body, 'text-center')}>{own ? 'Publique pela Comunidade e suas fotos aparecem nesta grade.' : 'Esta conta ainda não publicou fotos.'}</Text>
    {own && onNewPhoto ? <Button title="Publicar foto" onPress={onNewPhoto} /> : null}
    {viewer}
  </View>

  // Linhas de três; no perfil próprio a última linha incompleta ganha o quadro "Nova foto".
  type Cell = { kind: 'post'; post: Post; index: number } | { kind: 'add' } | { kind: 'blank' }
  const cells: Cell[] = list.items.map((post, index) => ({ kind: 'post', post, index }))
  if (own && onNewPhoto && cells.length % 3) cells.push({ kind: 'add' })
  while (cells.length % 3) cells.push({ kind: 'blank' })
  const rows = Array.from({ length: cells.length / 3 }, (_, row) => cells.slice(row * 3, row * 3 + 3))
  return <View>
    <View accessibilityLabel={`Fotos de ${ownerName}`} className="gap-0.5">
      {rows.map((row, rowIndex) => <View key={rowIndex} className="flex-row gap-0.5">
        {row.map((cell, cellIndex) => cell.kind === 'post'
          ? <Pressable key={cell.post.id} accessibilityRole="button" accessibilityLabel={`Abrir publicação: ${cell.post.caption || `foto de ${ownerName}`}`} onPress={() => setOpen(cell.index)} className="aspect-square grow basis-0">
            <PostImage path={cell.post.image_url} token={token} label="" className="h-full w-full" />
          </Pressable>
          : cell.kind === 'add'
            ? <Pressable key="add" accessibilityRole="button" accessibilityLabel="Nova foto" onPress={onNewPhoto} className="aspect-square grow basis-0 items-center justify-center gap-1 border border-dashed border-brand bg-brand-soft">
              <Text className="text-[22px] text-brand">+</Text>
              <Text className="text-[12px] font-semibold text-brand">Nova foto</Text>
            </Pressable>
            : <View key={`blank-${cellIndex}`} className="aspect-square grow basis-0" />)}
      </View>)}
    </View>
    {list.moreError ? <Text accessibilityRole="alert" className={cx(tw.error, 'px-5.5')}>{list.moreError}</Text> : null}
    {list.hasMore ? <View className="px-5.5"><Button secondary title={list.busy ? 'Carregando…' : 'Carregar mais fotos'} disabled={list.busy} onPress={() => void list.loadMore()} /></View> : null}
    {viewer}
  </View>
}
