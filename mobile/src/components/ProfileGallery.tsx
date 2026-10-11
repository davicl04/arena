import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import PostImage from './PostImage'
import type { PostUpdate } from './PostItem'
import PostViewer from './PostViewer'
import { Button, styles } from './ui'

const GAP = 2

/**
 * Grade de fotos 3×N de `/users/{id}/posts`, em linhas mapeadas (o perfil já rola num ScrollView).
 * É dona da lista e a compartilha com o visualizador "Publicações".
 * `onPostUpdate`/`onPostRemove` avisam quem mantém outra cópia do mesmo post (o feed da Comunidade).
 */
export default function ProfileGallery({ userId, ownerName, ownerUsername, viewerId, token, own = false, onNewPhoto, onPostUpdate, onPostRemove, onExpired }: {
  userId: number; ownerName: string; ownerUsername: string; viewerId: number; token: string | null; own?: boolean
  onNewPhoto?: () => void; onPostUpdate?: PostUpdate; onPostRemove?: (id: number) => void; onExpired: () => void
}) {
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
  if (list.loading) return <ActivityIndicator accessibilityLabel="Carregando fotos" color="#005a36" style={{ marginVertical: 24 }} />
  if (list.error) return <View style={{ padding: 22 }}>
    <Text accessibilityRole="alert" style={styles.error}>{list.error.message}</Text>
    <Button secondary title="Tentar novamente" onPress={list.reload} />
  </View>
  // O visualizador continua montado quando a lista esvazia, para se fechar sozinho.
  if (!list.items.length) return <View style={{ padding: 22, alignItems: 'center' }}>
    <Text accessibilityRole="header" style={[styles.heading, { textAlign: 'center' }]}>Nenhuma foto por aqui</Text>
    <Text style={[styles.body, { textAlign: 'center' }]}>{own ? 'Publique pela Comunidade e suas fotos aparecem nesta grade.' : 'Esta conta ainda não publicou fotos.'}</Text>
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
    <View accessibilityLabel={`Fotos de ${ownerName}`} style={{ gap: GAP }}>
      {rows.map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: 'row', gap: GAP }}>
        {row.map((cell, cellIndex) => cell.kind === 'post'
          ? <Pressable key={cell.post.id} accessibilityRole="button" accessibilityLabel={`Abrir publicação: ${cell.post.caption || `foto de ${ownerName}`}`} onPress={() => setOpen(cell.index)} style={{ flex: 1, aspectRatio: 1 }}>
            <PostImage path={cell.post.image_url} token={token} label="" style={{ width: '100%', height: '100%' }} />
          </Pressable>
          : cell.kind === 'add'
            ? <Pressable key="add" accessibilityRole="button" accessibilityLabel="Nova foto" onPress={onNewPhoto} style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#edf3ef', borderWidth: 1, borderStyle: 'dashed', borderColor: '#005a36' }}>
              <Text style={{ fontSize: 22, color: '#005a36' }}>+</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#005a36' }}>Nova foto</Text>
            </Pressable>
            : <View key={`blank-${cellIndex}`} style={{ flex: 1, aspectRatio: 1 }} />)}
      </View>)}
    </View>
    {list.moreError ? <Text accessibilityRole="alert" style={[styles.error, { paddingHorizontal: 22 }]}>{list.moreError}</Text> : null}
    {list.hasMore ? <View style={{ paddingHorizontal: 22 }}><Button secondary title={list.busy ? 'Carregando…' : 'Carregar mais fotos'} disabled={list.busy} onPress={() => void list.loadMore()} /></View> : null}
    {viewer}
  </View>
}
