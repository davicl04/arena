import { afterEach, expect, it, vi } from 'vitest'
import { cropImage } from '../src/utils/cropImage'

interface FakeContext { canvas: HTMLCanvasElement; translate: ReturnType<typeof vi.fn>; rotate: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> }

function stubCanvas() {
  const contexts: FakeContext[] = []
  vi.stubGlobal('Image', class { src = ''; naturalWidth = 200; naturalHeight = 100; decode = async () => undefined })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const context = { canvas: this, translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }
    contexts.push(context)
    return context as unknown as CanvasRenderingContext2D
  } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['webp'], { type: 'image/webp' })))
  return contexts
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('gira a imagem numa tela do tamanho da caixa antes de recortar a área', async () => {
  const contexts = stubCanvas()
  await cropImage('blob:foto', { x: 10, y: 20, width: 80, height: 80 }, { rotation: 90, maxWidth: 40, maxHeight: 40 })
  const [rotated, output] = contexts
  expect([rotated.canvas.width, rotated.canvas.height]).toEqual([100, 200])
  expect(rotated.rotate).toHaveBeenCalledWith(Math.PI / 2)
  expect(output.drawImage).toHaveBeenCalledWith(rotated.canvas, 10, 20, 80, 80, 0, 0, 40, 40)
})

it('sem giro, recorta direto da imagem original', async () => {
  const contexts = stubCanvas()
  await cropImage('blob:foto', { x: 0, y: 0, width: 50, height: 50 }, { rotation: 360 })
  expect(contexts).toHaveLength(1)
  expect(contexts[0].drawImage.mock.calls[0][0]).not.toBeInstanceOf(HTMLCanvasElement)
})
