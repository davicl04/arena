import { useEffect, useState } from 'react'
import { Animated, View, useWindowDimensions } from 'react-native'
import { Text } from './Text'
import { LoadError } from './arena/LoadError'
import { ArenaMark } from './arena/ArenaMark'
import { ActionButton, TextAction } from './arena/controls'
import { colors as fixedColors } from '../theme'
import { Button } from './ui'
import { useThemeColors } from '../hooks/useTheme'

const SEGMENT = 0.4

/** Barra de progresso fina e indeterminada (verde sobre trilho menta translúcido). */
export function ProgressBar({ label }: { label: string }) {
  const colors = useThemeColors()
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
    {[0, 1].map(index => <View key={index} importantForAccessibility="no-hide-descendants" className="mb-1.5 bg-surface">
      <View className="aspect-square w-full bg-line" />
      <View className="gap-2 p-3.5">
        <View className="h-3 w-2/3 rounded-full bg-app" />
        <View className="h-3 w-1/3 rounded-full bg-app" />
      </View>
    </View>)}
  </View>
}

/** Feed vazio ("A arquibancada está vazia"), como o estado da web: o Coliseu menta no disco `forest`, título, texto e as duas ações. */
export function FeedEmpty({ onPublish, onSearch }: { onPublish: () => void; onSearch: () => void }) {
  return <View className="mx-6 mt-10 items-center gap-1">
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="mb-4 size-34 items-center justify-center rounded-full bg-[#0b221814]">
      <View className="size-30 items-center justify-center rounded-full bg-forest"><ArenaMark width={72} height={54} color={fixedColors.mint} /></View>
    </View>
    <Text accessibilityRole="header" className="text-center text-[16px] text-heading">A arquibancada está vazia</Text>
    <Text className="mt-1 mb-3.5 max-w-[270px] text-center text-[11.5px] leading-[18px] text-ink-muted">Alie-se a atletas para ver as fotos deles aqui, ou abra os trabalhos com a sua.</Text>
    <View className="flex-row flex-wrap justify-center gap-2">
      <ActionButton fit size="sm" icon="camera" title="Publicar foto" onPress={onPublish} />
      <TextAction title="Buscar atletas" onPress={onSearch} />
    </View>
  </View>
}

/** Erro na primeira página do feed (`LoadError` de tela; `cause` é o erro da lista, para reconhecer a falta de conexão). */
export function FeedError({ onRetry, cause }: { onRetry: () => void; cause?: unknown }) {
  return <LoadError size="screen" title="Feed indisponível" text="Não foi possível carregar as publicações." cause={cause} onRetry={onRetry} />
}

/** Fim da lista: cartão "Chegou ao fim" com convite para publicar. */
export function FeedEnd({ onPublish }: { onPublish: () => void }) {
  return <View className="mx-3.5 mt-3 items-center rounded-card bg-surface p-5.5">
    <Text accessibilityRole="header" className="text-[17px] font-bold text-ink">Chegou ao fim</Text>
    <Text className="mt-1 text-[14px] text-ink-muted">Que tal compartilhar a sua?</Text>
    <View className="w-full max-w-[240px]"><Button title="Publicar" onPress={onPublish} /></View>
  </View>
}
