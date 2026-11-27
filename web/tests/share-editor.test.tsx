import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import { ShareStoryScreen } from '../src/components/share/ShareStoryScreen'
import { stickerLayout } from '../src/components/share/stickerLayout'
import { stickerContent } from '../src/components/share/stickerContent'
import { MAX_ZOOM } from '../src/components/share/storyFraming'
import { Toaster } from '../src/components/ui/toast'
import { coliseumSvg, fakeBitmap, fakeContext, FakePath2D, photoFile, shareMatch } from './share-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/*
 * Editor do Story montado (ticket 04): foto, enquadramento, posição da placa e exportação. O Canvas é falso (jsdom):
 * os testes conferem o que foi desenhado e os arquivos pedidos ao `toBlob`, não pixels.
 */

let canvas: ReturnType<typeof fakeContext>
let blobs: { width: number; height: number; type: string | undefined; quality: number | undefined }[]
let downloads: string[]
let bitmaps: ReturnType<typeof fakeBitmap>[]

beforeEach(() => {
  vi.mocked(request).mockReset()
  vi.mocked(request).mockResolvedValue(shareMatch() as never)
  canvas = fakeContext()
  blobs = []
  downloads = []
  bitmaps = [fakeBitmap(1600, 900), fakeBitmap(900, 1600)]
  vi.stubGlobal('Path2D', FakePath2D)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => coliseumSvg })))
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmaps.shift() ?? fakeBitmap(1200, 1200)))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvas.ctx as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type, quality) {
    blobs.push({ width: this.width, height: this.height, type, quality })
    callback(new Blob(['imagem'], { type }))
  })
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:arquivo'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
})
afterEach(() => {
  cleanup()
  // `navigator.share` e `canShare` estubados por teste.
  delete (navigator as Partial<Navigator> & Record<string, unknown>).share
  delete (navigator as Partial<Navigator> & Record<string, unknown>).canShare
})

function stubShare(share: (data: ShareData) => Promise<void>, canShare: (data: ShareData) => boolean = () => true) {
  const mocks = { share: vi.fn(share), canShare: vi.fn(canShare) }
  Object.assign(navigator, mocks)
  return mocks
}

async function openEditor() {
  const ui = userEvent.setup()
  render(<><ShareStoryScreen target={{ kind: 'partida', id: 50 }} onClose={vi.fn()} onExpired={vi.fn()} /><Toaster /></>)
  await screen.findByRole('img')
  // A prévia só desenha depois de carregar fontes e símbolos.
  await waitFor(() => expect(canvas.texts.some(item => item.text === 'arena')).toBe(true))
  return ui
}

async function choosePhoto(ui: ReturnType<typeof userEvent.setup>, file = photoFile()) {
  await ui.upload(screen.getByLabelText('Foto do Story'), file)
  return screen.findByRole('group', { name: 'Enquadramento da foto' })
}

/** Último `drawImage` da foto no Canvas (x, y, largura e altura). */
const lastPhotoDraw = () => canvas.ctx.drawImage.mock.calls.at(-1)!.slice(1) as number[]

const shareButton = () => screen.getByRole('button', { name: /Compartilhar imagem|Gerando imagem/ }) as HTMLButtonElement

describe('editor do Story: sem foto', () => {
  it('mostra o adesivo sobre o xadrez, "Escolher foto" e as ações de foto desabilitadas', async () => {
    await openEditor()
    expect(screen.getByRole('button', { name: 'Escolher foto' })).not.toBeNull()
    expect(shareButton().disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Baixar imagem' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Trocar foto' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Ampliar a foto' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Salvar só o adesivo' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('group', { name: 'Enquadramento da foto' })).toBeNull()
    expect(canvas.ctx.drawImage).not.toHaveBeenCalled()
    const input = screen.getByLabelText('Foto do Story') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
  })

  it('o "Escolher foto" da prévia abre a escolha de arquivo', async () => {
    const ui = await openEditor()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    await ui.click(screen.getByRole('button', { name: 'Escolher foto' }))
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('editor do Story: posição da placa', () => {
  it('é um grupo de opções acessível; trocar redesenha a placa e a assinatura continua embaixo', async () => {
    const ui = await openEditor()
    const group = screen.getByRole('radiogroup', { name: 'Posição da placa' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map(radio => [radio.textContent, radio.getAttribute('aria-checked')])).toEqual([['Topo', 'true'], ['Centro', 'false'], ['Base', 'false']])
    const content = stickerContent({ kind: 'partida', match: shareMatch() })
    const labelY = () => canvas.texts.filter(item => item.text === 'RESULTADO').at(-1)!.y / (288 / 360)
    const wordY = () => canvas.texts.filter(item => item.text === 'arena').at(-1)!.y
    const signature = wordY()
    await ui.click(within(group).getByRole('radio', { name: 'Base' }))
    expect(within(group).getByRole('radio', { name: 'Base' }).getAttribute('aria-checked')).toBe('true')
    const base = stickerLayout(content, { position: 'base' })
    expect(labelY()).toBeGreaterThan(base.plate.box.y)
    expect(labelY()).toBeLessThan(base.plate.box.y + base.plate.box.h)
    expect(wordY()).toBe(signature)
    // As setas movem a seleção, como as abas.
    await ui.keyboard('{ArrowLeft}')
    expect(within(group).getByRole('radio', { name: 'Centro' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(within(group).getByRole('radio', { name: 'Centro' }))
  })
})

describe('editor do Story: foto e enquadramento', () => {
  it('com foto, a foto cobre o quadro e o compartilhar é liberado', async () => {
    const ui = await openEditor()
    const frame = await choosePhoto(ui)
    expect(frame.getAttribute('tabindex')).toBe('0')
    expect(within(frame).getByRole('img').getAttribute('aria-label')).toMatch(/^Story com a sua foto\. Adesivo de resultado/)
    expect(shareButton().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Escolher foto' })).toBeNull()
    // Foto deitada 1600×900 reduzida não muda (cobre 1080×1920 só com 3413 px de largura): em 1×, altura do quadro.
    const [x, y, w, h] = lastPhotoDraw()
    expect(h).toBeCloseTo(512)
    expect(y).toBeCloseTo(0)
    expect(x).toBeCloseTo((288 - w) / 2)
  })

  it('pelo teclado, com o quadro focado, as setas movem e + e − ampliam, sem sair dos limites', async () => {
    const ui = await openEditor()
    const frame = await choosePhoto(ui)
    frame.focus()
    const [x0] = lastPhotoDraw()
    await ui.keyboard('{ArrowRight}')
    expect(lastPhotoDraw()[0]).toBeGreaterThan(x0)
    await ui.keyboard('{ArrowDown}')
    // Em 1×, a foto deitada não sobra na altura: descer não a tira do lugar.
    expect(lastPhotoDraw()[1]).toBeCloseTo(0)
    const height0 = lastPhotoDraw()[3]
    await ui.keyboard('+')
    expect(lastPhotoDraw()[3]).toBeCloseTo(height0 * 1.25)
    await ui.keyboard('-')
    expect(lastPhotoDraw()[3]).toBeCloseTo(height0)
    // Muito para um lado: a borda da foto para na borda do quadro.
    for (let i = 0; i < 40; i++) fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true })
    expect(lastPhotoDraw()[0]).toBeCloseTo(0)
  })

  it('os botões ampliam até o limite, que fica marcado sem perder o foco', async () => {
    const ui = await openEditor()
    await choosePhoto(ui)
    const zoomIn = screen.getByRole('button', { name: 'Ampliar a foto' })
    const zoomOut = screen.getByRole('button', { name: 'Reduzir a foto' })
    expect(zoomOut.getAttribute('aria-disabled')).toBe('true')
    const height0 = lastPhotoDraw()[3]
    for (let i = 0; i < 8; i++) await ui.click(zoomIn)
    expect(lastPhotoDraw()[3]).toBeCloseTo(height0 * MAX_ZOOM)
    expect(zoomIn.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(zoomIn)
    await ui.click(zoomOut)
    expect(lastPhotoDraw()[3]).toBeCloseTo(height0 * MAX_ZOOM / 1.25)
  })

  it('arrastar move, a roda amplia e a pinça amplia, sempre cobrindo o quadro', async () => {
    const ui = await openEditor()
    const frame = await choosePhoto(ui)
    const [x0] = lastPhotoDraw()
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 130, clientY: 300, pointerType: 'touch' })
    fireEvent.pointerUp(frame, { pointerId: 1, pointerType: 'touch' })
    const [x1, y1] = lastPhotoDraw()
    expect(x1).toBeCloseTo(x0 + 30)
    expect(y1).toBeCloseTo(0)
    // Movimento sem dedo apertado não arrasta.
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 400, clientY: 400, pointerType: 'touch' })
    expect(lastPhotoDraw()[0]).toBeCloseTo(x1)
    const height0 = lastPhotoDraw()[3]
    fireEvent.wheel(frame, { deltaY: -200, clientX: 144, clientY: 256 })
    expect(lastPhotoDraw()[3]).toBeGreaterThan(height0)
    const height1 = lastPhotoDraw()[3]
    fireEvent.pointerDown(frame, { pointerId: 2, clientX: 100, clientY: 200, pointerType: 'touch' })
    fireEvent.pointerDown(frame, { pointerId: 3, clientX: 150, clientY: 200, pointerType: 'touch' })
    fireEvent.pointerMove(frame, { pointerId: 3, clientX: 200, clientY: 200, pointerType: 'touch' })
    expect(lastPhotoDraw()[3]).toBeCloseTo(Math.min(height1 * 2, height0 * MAX_ZOOM))
    const [x, y, w, h] = lastPhotoDraw()
    expect(x).toBeLessThanOrEqual(1e-6)
    expect(y).toBeLessThanOrEqual(1e-6)
    expect(x + w).toBeGreaterThanOrEqual(288 - 1e-6)
    expect(y + h).toBeGreaterThanOrEqual(512 - 1e-6)
  })

  it('"Trocar foto" mantém a posição da placa e recomeça o enquadramento', async () => {
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(screen.getByRole('radio', { name: 'Centro' }))
    await ui.click(screen.getByRole('button', { name: 'Ampliar a foto' }))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    await ui.click(screen.getByRole('button', { name: 'Trocar foto' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    await ui.upload(screen.getByLabelText('Foto do Story'), photoFile('outra.jpg'))
    // A segunda foto (em pé, 900×1600) cobre o quadro pela largura, em 1×.
    await waitFor(() => expect(lastPhotoDraw()[2]).toBeCloseTo(288))
    expect(screen.getByRole('radio', { name: 'Centro' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Reduzir a foto' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('explica a foto que não pôde ser usada e continua sem foto', async () => {
    const ui = userEvent.setup({ applyAccept: false })
    render(<><ShareStoryScreen target={{ kind: 'partida', id: 50 }} onClose={vi.fn()} onExpired={vi.fn()} /><Toaster /></>)
    await screen.findByRole('img')
    await ui.upload(screen.getByLabelText('Foto do Story'), photoFile('notas.txt', 'text/plain'))
    expect((await screen.findAllByText('Não foi possível usar esta foto')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Escolha um arquivo de imagem (JPEG, PNG ou WebP).').length).toBeGreaterThan(0)
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('formato'))
    await ui.upload(screen.getByLabelText('Foto do Story'), photoFile('foto.heic', 'image/heic'))
    expect((await screen.findAllByText(/Este navegador não conseguiu abrir a imagem/)).length).toBeGreaterThan(0)
    expect(shareButton().disabled).toBe(true)
  })
})

describe('editor do Story: exportação', () => {
  it('"Compartilhar imagem" usa o menu do navegador com o JPEG 1080×1920', async () => {
    const { share, canShare } = stubShare(async () => undefined)
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(shareButton())
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const file = (share.mock.calls[0][0].files as File[])[0]
    expect(file.name).toBe('arena-story-partida-50.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(canShare).toHaveBeenCalled()
    expect(blobs).toEqual([{ width: 1080, height: 1920, type: 'image/jpeg', quality: 0.92 }])
    expect(downloads).toEqual([])
  })

  it('a prévia e o arquivo coincidem: mesma foto, mesmo enquadramento e mesma posição', async () => {
    stubShare(async () => undefined)
    const ui = await openEditor()
    const frame = await choosePhoto(ui)
    await ui.click(screen.getByRole('radio', { name: 'Base' }))
    frame.focus()
    await ui.keyboard('++{ArrowLeft}{ArrowUp}{ArrowUp}')
    const preview = lastPhotoDraw()
    const previewLabel = canvas.texts.filter(item => item.text === 'RESULTADO').at(-1)!
    canvas.texts.length = 0
    await ui.click(shareButton())
    await waitFor(() => expect(blobs).toHaveLength(1))
    const exported = lastPhotoDraw()
    const ratio = 1080 / 288
    preview.forEach((value, index) => expect(value * ratio).toBeCloseTo(exported[index], 6))
    const exportedLabel = canvas.texts.find(item => item.text === 'RESULTADO')!
    expect(exportedLabel.y).toBeCloseTo(previewLabel.y * ratio, 6)
  })

  it('cancelar o menu do navegador não mostra erro nem baixa', async () => {
    stubShare(async () => { throw new DOMException('Cancelado', 'AbortError') })
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(shareButton())
    await waitFor(() => expect(shareButton().textContent).toBe('Compartilhar imagem'))
    expect(screen.queryByText('Não foi possível compartilhar a imagem')).toBeNull()
    expect(downloads).toEqual([])
  })

  it('avisa a falha do compartilhamento', async () => {
    stubShare(async () => { throw new DOMException('Negado', 'NotAllowedError') })
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(shareButton())
    expect((await screen.findAllByText('Não foi possível compartilhar a imagem')).length).toBeGreaterThan(0)
    expect(downloads).toEqual([])
  })

  it('sem compartilhamento de arquivos, baixa o JPEG e explica', async () => {
    stubShare(async () => undefined, () => false)
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(shareButton())
    expect((await screen.findAllByText('Imagem baixada')).length).toBeGreaterThan(0)
    expect(downloads).toEqual(['arena-story-partida-50.jpg'])
    expect(navigator.share).not.toHaveBeenCalled()
  })

  it('"Baixar imagem" baixa o JPEG 1080×1920', async () => {
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(screen.getByRole('button', { name: 'Baixar imagem' }))
    expect((await screen.findAllByText('Imagem salva')).length).toBeGreaterThan(0)
    expect(downloads).toEqual(['arena-story-partida-50.jpg'])
    expect(blobs).toEqual([{ width: 1080, height: 1920, type: 'image/jpeg', quality: 0.92 }])
  })

  it('"Salvar só o adesivo" continua dando o PNG transparente, com a placa na posição escolhida', async () => {
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(screen.getByRole('radio', { name: 'Centro' }))
    canvas.ctx.drawImage.mockClear()
    canvas.texts.length = 0
    await ui.click(screen.getByRole('button', { name: 'Salvar só o adesivo' }))
    await waitFor(() => expect(downloads).toEqual(['arena-adesivo-partida-50.png']))
    expect(blobs).toEqual([{ width: 1080, height: 1920, type: 'image/png', quality: undefined }])
    expect(canvas.ctx.drawImage).not.toHaveBeenCalled()
    const centro = stickerLayout(stickerContent({ kind: 'partida', match: shareMatch() }), { position: 'centro' })
    const label = canvas.texts.find(item => item.text === 'RESULTADO')!
    expect(label.y / 3).toBeGreaterThan(centro.plate.box.y)
    expect(label.y / 3).toBeLessThan(centro.plate.box.y + centro.plate.box.h)
  })

  it('fica ocupado durante a exportação e ignora um segundo pedido', async () => {
    let finish!: () => void
    const share = stubShare(() => new Promise<void>(done => { finish = done })).share
    const ui = await openEditor()
    await choosePhoto(ui)
    await ui.click(shareButton())
    await waitFor(() => expect(share).toHaveBeenCalled())
    const busy = shareButton()
    expect(busy.textContent).toBe('Gerando imagem…')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Baixar imagem' }).getAttribute('aria-disabled')).toBe('true')
    await ui.click(busy)
    await ui.click(screen.getByRole('button', { name: 'Baixar imagem' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(downloads).toEqual([])
    await act(async () => finish())
    await waitFor(() => expect(shareButton().textContent).toBe('Compartilhar imagem'))
    expect(shareButton().getAttribute('aria-disabled')).toBe('false')
  })

  it('avisa quando o Story não pôde ser gerado', async () => {
    const ui = await openEditor()
    await choosePhoto(ui)
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback => callback(null))
    await ui.click(screen.getByRole('button', { name: 'Baixar imagem' }))
    expect((await screen.findAllByText('Não foi possível gerar a imagem')).length).toBeGreaterThan(0)
    expect(downloads).toEqual([])
  })
})
