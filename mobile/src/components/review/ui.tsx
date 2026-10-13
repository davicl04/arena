import type { ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { PagedList } from '../../hooks/usePagedList'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Button, Field } from '../ui'
import { LoadError } from '../arena/LoadError'

/*
 * Primitivos das telas de análise (comprovantes, devoluções, filas da administração e denúncias): linha de botões,
 * faixas, listas de termos, campo de texto longo e os estados de lista (carregando, erro, vazio). Botões, avisos, erros
 * e escolhas são os de `components/arena/controls.tsx`. Os mesmos blocos da web, no visual dos protótipos A2 e AD1.
 */

/** Linha de botões lado a lado (Aprovar | Recusar, Voltar | Confirmar). */
export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
}

/** Faixa de informação (amarela por padrão) com ícone. */
export function Banner({ children, icon = 'info', tone = 'warning' }: { children: ReactNode; icon?: IconName; tone?: 'warning' | 'success' | 'danger' }) {
  const look = tone === 'warning' ? { bg: colors['warning-bg'], fg: colors.warning } : tone === 'success' ? { bg: colors['success-bg'], fg: colors.brand } : { bg: '#fff0f2', fg: colors.danger }
  return <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, backgroundColor: look.bg, padding: 12 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name={icon} size={15} color={look.fg} /></View>
    <Text style={{ flex: 1, color: look.fg, fontSize: 12, lineHeight: 18 }}>{children}</Text>
  </View>
}

/** Rótulo de seção em caixa alta (9 pt). */
export function Eyebrow({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={{ marginTop: 14, marginBottom: 4, color: colors['ink-muted'], fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>
}

/** Termos e valores em duas colunas, no fundo sutil da folha. */
export function InfoGrid({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) {
  return <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.subtle, padding: 13 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
      {items.map(([term, value]) => <View key={term} accessible={typeof value === 'string'} accessibilityLabel={typeof value === 'string' ? `${term}: ${value}` : undefined} style={{ width: '50%', paddingRight: 8 }}>
        <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{term}</Text>
        {typeof value === 'string' ? <Text selectable style={{ marginTop: 2, color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{value}</Text> : <View style={{ marginTop: 2 }}>{value}</View>}
      </View>)}
    </View>
    {children}
  </View>
}

/** Bloco de rótulo e texto corrido dentro do `InfoGrid` (experiência, percurso). */
export function InfoText({ title, text, empty }: { title: string; text: string | null | undefined; empty: string }) {
  return <View style={{ marginTop: 10 }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
    <Text selectable style={{ marginTop: 2, color: text ? colors.ink : colors['ink-muted'], fontSize: 12.5, lineHeight: 18 }}>{text || empty}</Text>
  </View>
}

/** Campo de texto longo das folhas (detalhe da recusa, motivo da decisão). */
export function LongField({ label, value, onChangeText, max, disabled = false, invalid = false, placeholder }: {
  label: string; value: string; onChangeText: (text: string) => void; max: number; disabled?: boolean; invalid?: boolean; placeholder?: string
}) {
  return <Field label={label} multiline maxLength={max} value={value} onChangeText={onChangeText} editable={!disabled} placeholder={placeholder}
    textAlignVertical="top" accessibilityHint={invalid ? 'Campo com erro' : undefined} style={{ minHeight: 88, ...(invalid ? { borderColor: colors.error } : {}) }} />
}

/**
 * Carregando (com texto e indicador) ou erro de carregamento com "Tentar novamente" (`LoadError`: `size="section"` por
 * padrão, `"screen"` quando a falha deixa a tela sem conteúdo; `cause` é o erro lançado, para reconhecer a falta de
 * conexão); nada quando já há dados.
 */
export function LoadState({ loading, error, onRetry, loadingText, cause, size = 'section', title }: {
  loading: boolean; error: string | null; onRetry: () => void; loadingText: string; cause?: unknown; size?: 'screen' | 'section'; title?: string
}) {
  if (loading) {
    return <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 }}>
      <ActivityIndicator accessibilityLabel={loadingText} color={colors.brand} />
      <Text style={{ color: colors['ink-muted'], fontSize: 12.5 }}>{loadingText}</Text>
    </View>
  }
  if (error) {
    return <LoadError size={size} title={title} text={error} cause={cause} onRetry={onRetry} />
  }
  return null
}

/**
 * Estados da primeira página de uma lista paginada: carregando, erro com "Tentar novamente" e vazio. Sem conteúdo
 * enquanto a lista tem itens.
 */
export function ListMessage({ list, loadingText, emptyTitle, emptyText }: {
  list: Pick<PagedList<unknown>, 'loading' | 'error' | 'items' | 'reload'>
  loadingText: string
  emptyTitle: string
  emptyText: string
}) {
  if (list.loading || list.error) return <LoadState loading={list.loading} error={list.error?.message ?? null} cause={list.error} onRetry={list.reload} loadingText={loadingText} />
  if (!list.items.length) {
    return <View testID="list-empty" style={{ alignItems: 'center', gap: 6, borderRadius: 16, backgroundColor: '#ffffff', padding: 22, marginTop: 8 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors['success-bg'] }}><Icon name="check" size={22} color={colors.brand} /></View>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{emptyTitle}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{emptyText}</Text>
    </View>
  }
  return null
}

/** Versão compacta de `ListMessage` para listas dentro de um grupo: o vazio é só uma linha de texto. */
export function ListMessageInline({ list, loadingText, emptyText }: {
  list: Pick<PagedList<unknown>, 'loading' | 'error' | 'items' | 'reload'>; loadingText: string; emptyText: string
}) {
  if (list.loading || list.error) return <LoadState loading={list.loading} error={list.error?.message ?? null} cause={list.error} onRetry={list.reload} loadingText={loadingText} />
  if (!list.items.length) return <Text style={{ marginHorizontal: 4, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>{emptyText}</Text>
  return null
}

/** Rodapé da lista: erro ao carregar mais (continua no rodapé, é a trava da rolagem) e "Carregar mais …". */
export function LoadMore({ list, label }: { list: Pick<PagedList<unknown>, 'moreError' | 'hasMore' | 'busy' | 'loadMore'>; label: string }) {
  return <>
    {list.moreError ? <Text accessibilityRole="alert" style={{ marginTop: 10, color: colors.error, fontSize: 12.5 }}>{list.moreError}</Text> : null}
    {list.hasMore ? <Button secondary title={list.busy ? 'Carregando…' : label} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </>
}
