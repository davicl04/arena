import { useEffect, useState } from 'react'
import { Animated, Text, View, useWindowDimensions } from 'react-native'
import { LoadError } from './arena/LoadError'
import { Button } from './ui'
import { cx, tw } from '../styles'
import { colors } from '../theme'

const SEGMENT = 0.4

/** Barra de progresso fina e indeterminada (verde sobre trilho menta translúcido). */
export function ProgressBar({ label }: { label: string }) {
  const { width } = useWindowDimensions()
  const [progress] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1100, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [progress])
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width * SEGMENT, width] })
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} className="h-[3px] w-full overflow-hidden bg-mint-track">
    {/* Valores animados e a largura derivada da tela ficam em `style` (o Animated não recebe className). */}
    <Animated.View style={{ width: width * SEGMENT, height: 3, backgroundColor: colors.brand, transform: [{ translateX }] }} />
  </View>
}

/** Carregando a primeira página: barra de progresso logo abaixo da barra escura e esqueleto de dois posts. */
export function FeedLoading() {
  return <View>
    <ProgressBar label="Carregando publicações" />
    {[0, 1].map(index => <View key={index} importantForAccessibility="no-hide-descendants" className="mb-1.5 bg-white">
      <View className="aspect-square w-full bg-line" />
      <View className="gap-2 p-3.5">
        <View className="h-3 w-2/3 rounded-full bg-app" />
        <View className="h-3 w-1/3 rounded-full bg-app" />
      </View>
    </View>)}
  </View>
}

/** Ícone neutro de foto (não há símbolo do Coliseu entre os assets do app). */
function PhotoGlyph() {
  return <View className="h-7 w-8 items-center justify-center rounded-[6px] border-2 border-glass-accent">
    <View className="h-3 w-3 rounded-full border-2 border-glass-accent" />
  </View>
}

/** Feed vazio ("A arquibancada está vazia"). */
export function FeedEmpty({ onPublish, onSearch }: { onPublish: () => void; onSearch: () => void }) {
  return <View className="items-center px-6 pt-10 pb-6">
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="mb-4 h-18 w-18 items-center justify-center rounded-full bg-forest"><PhotoGlyph /></View>
    <Text accessibilityRole="header" className={cx(tw.heading, 'text-center')}>A arquibancada está vazia</Text>
    <Text className={cx(tw.body, 'text-center')}>Siga atletas para ver as fotos deles aqui, ou abra os trabalhos com a sua.</Text>
    <View className="w-full max-w-[320px]">
      <Button title="Publicar foto" onPress={onPublish} />
      <Button secondary title="Buscar atletas" onPress={onSearch} />
    </View>
  </View>
}

/** Erro na primeira página do feed (`LoadError` de tela; `cause` é o erro da lista, para reconhecer a falta de conexão). */
export function FeedError({ onRetry, cause }: { onRetry: () => void; cause?: unknown }) {
  return <LoadError size="screen" title="Feed indisponível" text="Não foi possível carregar as publicações." cause={cause} onRetry={onRetry} />
}

/** Fim da lista: cartão "Chegou ao fim" com convite para publicar. */
export function FeedEnd({ onPublish }: { onPublish: () => void }) {
  return <View className="mx-3.5 mt-3 items-center rounded-card bg-white p-5.5">
    <Text accessibilityRole="header" className="text-[17px] font-bold text-ink">Chegou ao fim</Text>
    <Text className="mt-1 text-[14px] text-ink-muted">Que tal compartilhar a sua?</Text>
    <View className="w-full max-w-[240px]"><Button title="Publicar" onPress={onPublish} /></View>
  </View>
}
