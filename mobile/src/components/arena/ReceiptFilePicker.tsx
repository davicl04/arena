import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import type { UploadFile } from '../../api/client'
import { fileSize, receiptFileError } from '../../api/receipts'
import { colors } from '../../theme'
import { pickReceiptFile, toUploadFile } from '../../utils/receiptFile'
import type { PickSource } from '../../utils/receiptFile'
import { Icon } from '../Icon'
import { ErrorText, Hint } from './controls'

function PickButton({ label, hint, onPress, disabled }: { label: string; hint: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors['line-strong'], backgroundColor: colors.subtle, paddingHorizontal: 12, opacity: disabled ? 0.5 : 1 }}>
    <Icon name="upload" size={18} color={colors.brand} />
    <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
  </Pressable>
}

/**
 * Escolha do comprovante (do evento ou da devolução): imagem (JPEG, PNG ou WebP) ou PDF de até 5 MiB, no seletor de
 * documentos ou na galeria, conferida no cliente com as regras e as mensagens do servidor. Mostra o arquivo escolhido
 * (miniatura ou ícone, nome, tamanho e tipo) e o motivo de uma recusa; `onFile` recebe o arquivo válido ou `null`.
 */
export function ReceiptFilePicker({ file, onFile, busy, pickedTestID }: { file: UploadFile | null; onFile: (file: UploadFile | null) => void; busy: boolean; pickedTestID: string }) {
  const [invalid, setInvalid] = useState('')
  async function choose(source: PickSource) {
    setInvalid('')
    try {
      const picked = await pickReceiptFile(source)
      if (!picked) return
      const next = toUploadFile(picked)
      const problem = receiptFileError(next)
      setInvalid(problem ?? '')
      onFile(problem ? null : next)
    } catch { setInvalid('Não foi possível abrir o seletor de arquivos. Tente de novo.') }
  }
  const image = file?.type.startsWith('image/') ?? false
  return <>
    <View style={{ gap: 8 }}>
      <PickButton label={file ? 'Trocar arquivo (imagem ou PDF)' : 'Escolher arquivo (imagem ou PDF)'} hint="Abre o seletor de arquivos" disabled={busy} onPress={() => void choose('documento')} />
      <PickButton label="Escolher da galeria" hint="Abre as fotos do aparelho" disabled={busy} onPress={() => void choose('galeria')} />
      {file ? <View testID={pickedTestID} accessible accessibilityLabel={`Arquivo escolhido: ${file.name}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#ffffff', padding: 10 }}>
        {image ? <Image accessibilityElementsHidden source={{ uri: file.uri }} resizeMode="cover" style={{ width: 48, height: 60, borderRadius: 8, backgroundColor: colors.subtle }} />
          : <View style={{ width: 48, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.subtle }}><Icon name="file" size={22} color={colors.brand} /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{file.name}</Text>
          <Hint>{typeof file.size === 'number' ? `${fileSize(file.size)} · ` : ''}{file.type === 'application/pdf' ? 'PDF' : 'Imagem'}</Hint>
        </View>
      </View> : <Hint>Imagem (JPEG, PNG ou WebP) ou PDF, até 5 MiB.</Hint>}
    </View>
    {invalid ? <ErrorText>{invalid}</ErrorText> : null}
  </>
}
