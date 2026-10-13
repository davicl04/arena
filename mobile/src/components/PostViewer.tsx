import { useEffect, useRef } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native'
import type { Post } from '../api/client'
import type { PagedList } from '../hooks/usePagedList'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'
import { Screen } from './Screen'
import { ToastViewport } from './toast/ToastViewport'
import { Button } from './ui'
import { tw } from '../styles'
import { colors } from '../theme'

/**
 * Página "Publicações": feed vertical em tela cheia que abre no post tocado.
 * A lista é a mesma da galeria, para que curtidas, legendas e exclusões apareçam nos dois lugares.
 */
export default function PostViewer({ list, index, username, viewerId, token, onUpdate, onRemove, onClose, onExpired }: {
  list: PagedList<Post>; index: number; username: string; viewerId: number; token: string | null
  onUpdate: PostUpdate; onRemove: (id: number) => void; onClose: () => void; onExpired: () => void
}) {
  const ref = useRef<FlatList<Post>>(null)
  const empty = !list.loading && list.items.length === 0
  // Ao excluir o último post da lista, não há mais o que mostrar.
  useEffect(() => { if (empty) onClose() }, [empty, onClose])
  const start = Math.max(0, Math.min(index, list.items.length - 1))
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <Screen className={tw.screen}><KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-row items-center gap-2 border-b border-line bg-white px-2 py-1.5">
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} className="min-h-11 min-w-11 items-center justify-center"><Text className="text-[24px] text-brand">‹</Text></Pressable>
        <View className="grow basis-0">
          <Text numberOfLines={1} className="text-[11px] font-bold tracking-[1.5px] text-brand">@{username.toUpperCase()}</Text>
          <Text accessibilityRole="header" className="text-[18px] font-bold text-ink">Publicações</Text>
        </View>
      </View>
      <FlatList ref={ref} data={list.items} keyExtractor={item => String(item.id)} initialScrollIndex={start}
        contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={info => {
          // Sem altura fixa por item: aproxima pelo tamanho médio e tenta de novo após o layout.
          ref.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
          setTimeout(() => ref.current?.scrollToIndex({ index: info.index, animated: false }), 60)
        }}
        renderItem={({ item }) => <PostItem post={item} viewerId={viewerId} token={token} onUpdate={onUpdate} onRemove={onRemove} onExpired={onExpired} />}
        onEndReached={() => { if (list.hasMore && !list.busy) void list.loadMore() }} onEndReachedThreshold={0.5}
        ListFooterComponent={<View>
          {list.busy ? <ActivityIndicator accessibilityLabel="Carregando publicações" color={colors.brand} /> : null}
          {list.moreError ? <Text accessibilityRole="alert" className={tw.error}>{list.moreError}</Text> : null}
          {list.hasMore && !list.busy ? <Button secondary title="Carregar mais publicações" onPress={() => void list.loadMore()} /> : null}
        </View>} />
    </KeyboardAvoidingView></Screen>
    <ToastViewport />
  </Modal>
}
