import { useEffect, useRef } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Post } from '../api/client'
import type { PagedList } from '../hooks/usePagedList'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'
import { Button, styles } from './ui'

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
    <SafeAreaView style={[styles.screen, { flex: 1 }]}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#cdd4d0' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onClose} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24, color: '#005a36' }}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: '#005a36' }}>@{username.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: '#343d39' }}>Publicações</Text>
        </View>
      </View>
      <FlatList ref={ref} data={list.items} keyExtractor={item => String(item.id)} initialScrollIndex={start}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={info => {
          // Sem altura fixa por item: aproxima pelo tamanho médio e tenta de novo após o layout.
          ref.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
          setTimeout(() => ref.current?.scrollToIndex({ index: info.index, animated: false }), 60)
        }}
        renderItem={({ item }) => <PostItem post={item} viewerId={viewerId} token={token} onUpdate={onUpdate} onRemove={onRemove} onExpired={onExpired} />}
        onEndReached={() => { if (list.hasMore && !list.busy) void list.loadMore() }} onEndReachedThreshold={0.5}
        ListFooterComponent={<View>
          {list.busy ? <ActivityIndicator accessibilityLabel="Carregando publicações" color="#005a36" /> : null}
          {list.moreError ? <Text accessibilityRole="alert" style={styles.error}>{list.moreError}</Text> : null}
          {list.hasMore && !list.busy ? <Button secondary title="Carregar mais publicações" onPress={() => void list.loadMore()} /> : null}
        </View>} />
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>
}
