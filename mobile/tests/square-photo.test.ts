import { describe, expect, it, vi } from 'vitest'
import { squarePhoto } from '../src/components/PostComposer'
import type { PhotoAsset } from '../src/components/PostComposer'
import { crops } from './support/image-manipulator'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))

const asset = (width: number, height: number) => ({ uri: 'file:///foto.jpg', width, height, mimeType: 'image/jpeg', fileName: 'foto.jpg', fileSize: 1000 }) as PhotoAsset

describe('recorte quadrado da foto da publicação', () => {
  it('foto que o seletor devolveu inteira (1206×802) vira o quadrado do centro, em JPEG', async () => {
    crops.length = 0
    const out = await squarePhoto(asset(1206, 802))
    expect(crops).toEqual([{ originX: 202, originY: 0, width: 802, height: 802 }])
    expect(out).toMatchObject({ uri: 'file:///foto.jpg#recorte', width: 802, height: 802, mimeType: 'image/jpeg', fileName: 'publicacao.jpg' })
  })

  it('foto já quadrada segue como veio', async () => {
    crops.length = 0
    const square = asset(800, 800)
    expect(await squarePhoto(square)).toBe(square)
    expect(crops).toEqual([])
  })
})
