import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import TeamFormPage from '../src/pages/TeamFormPage'
import { apiError, brasilia, goiania, mockApi, team } from './teams-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete, aspect, cropShape }: { onCropComplete: (area: unknown, pixels: { x: number; y: number; width: number; height: number }) => void; aspect: number; cropShape: string }) =>
    <button type="button" aria-label="Selecionar recorte" data-aspect={aspect} data-shape={cropShape} onClick={() => onCropComplete({}, { x: 0, y: 0, width: 40, height: 40 })} />,
}))

const user: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo', email: 'r@example.com', birth_date: '1990-01-01', social_public: true, is_admin: false, avatar: null, cover: null }
const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: true, is_public: false, level: null }
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:brasao'), revokeObjectURL: vi.fn() })
  vi.stubGlobal('Image', class { src = ''; decode = async () => undefined })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['webp'], { type: 'image/webp' })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke }) })

function renderForm(props: Partial<React.ComponentProps<typeof TeamFormPage>> = {}) {
  const handlers = { onDone: vi.fn(), onClosed: vi.fn(), onBack: vi.fn(), onExpired: vi.fn() }
  const view = renderWithToaster(<TeamFormPage user={user} profiles={[football]} cities={[brasilia, goiania]} {...handlers} {...props} />)
  return { ...handlers, ...view }
}
async function pickCrest(container: HTMLElement, ui: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(container.querySelector('#team-crest-file')!, { target: { files: [new File(['png'], 'brasao.png', { type: 'image/png' })] } })
  const crop = screen.getByRole('dialog', { name: 'Ajustar brasão' })
  expect(within(crop).getByRole('button', { name: 'Selecionar recorte' }).getAttribute('data-shape')).toBe('rect')
  expect(within(crop).getByRole('button', { name: 'Selecionar recorte' }).getAttribute('data-aspect')).toBe('1')
  await ui.click(within(crop).getByRole('button', { name: 'Selecionar recorte' }))
  await ui.click(within(crop).getByRole('button', { name: 'Usar imagem' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajustar brasão' })).toBeNull())
}

describe('Criar time (F2)', () => {
  it('cria o time com nome normalizado, cidade trocada pelo catálogo e brasão enviado depois', async () => {
    const created = team({ id: 40, name: 'Leões do Cerrado', initials: 'LC', city: goiania, member_count: 1, representative_count: 1 })
    const api = mockApi({ 'POST /teams': { ...created }, 'PUT /teams/40/crest': { ...created, crest_url: '/api/v1/teams/40/crest?v=7' } })
    const ui = userEvent.setup()
    const { container, onDone } = renderForm()
    expect(screen.getByRole('heading', { level: 1, name: 'Criar time' })).toBeTruthy()
    expect(screen.getByText('Seu time')).toBeTruthy()
    expect(screen.getByText(/Vem do seu perfil de futebol/)).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Criar time' })
    expect(submit.hasAttribute('disabled')).toBe(true)

    await ui.type(screen.getByLabelText('Nome do time'), 'ab')
    expect(submit.hasAttribute('disabled')).toBe(true)
    await ui.clear(screen.getByLabelText('Nome do time'))
    await ui.type(screen.getByLabelText('Nome do time'), '  Leões   do Cerrado ')
    expect(screen.getByText('21/40 · pelo menos 3 letras')).toBeTruthy()
    // A prévia é decorativa para leitores de tela; o texto dela acompanha a digitação.
    expect(screen.getByText('Leões do Cerrado', { selector: 'h2' })).toBeTruthy()
    expect(screen.getByText('Leões do Cerrado, Brasília, você representa.')).toBeTruthy()
    expect(screen.getAllByText('LC').length).toBeGreaterThan(0)

    await ui.click(screen.getByRole('button', { name: 'Trocar cidade' }))
    const cities = screen.getByRole('dialog', { name: 'Cidade do time' })
    await ui.type(within(cities).getByLabelText('Buscar cidade'), 'goi')
    expect(within(cities).queryByRole('button', { name: /Brasília/ })).toBeNull()
    await ui.click(within(cities).getByRole('button', { name: 'Goiânia · GO' }))
    expect(screen.getByText('Goiânia · GO')).toBeTruthy()

    await pickCrest(container, ui)
    expect(screen.getByText('Trocar imagem')).toBeTruthy()
    await ui.click(submit)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 40, crest_url: '/api/v1/teams/40/crest?v=7' })))
    expect(api.find('POST', '/teams')[0].body).toEqual({ name: 'Leões do Cerrado', city_id: goiania.id })
    expect(api.find('PUT', '/teams/40/crest')[0].body).toBeInstanceOf(FormData)
    expect((api.find('PUT', '/teams/40/crest')[0].body as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('o time criado continua em edição quando o brasão falha, e salvar de novo envia só o brasão', async () => {
    const created = team({ id: 41, name: 'Ferrugem FC', member_count: 1 })
    let crestAttempts = 0
    const api = mockApi({
      'POST /teams': created,
      'PUT /teams/41/crest': () => ++crestAttempts === 1 ? apiError(413, 'A imagem deve ter até 5 MiB.') : { ...created, crest_url: '/api/v1/teams/41/crest?v=1' },
    })
    const ui = userEvent.setup()
    const { container, onDone } = renderForm()
    await ui.type(screen.getByLabelText('Nome do time'), 'Ferrugem FC')
    await pickCrest(container, ui)
    await ui.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(await findToast('Time criado, mas o brasão não foi salvo: A imagem deve ter até 5 MiB.')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    await ui.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 41 })))
    expect(api.find('POST', '/teams')).toHaveLength(1)
    expect(api.find('PATCH', '/teams/41')).toHaveLength(0)
  })

  it('exige cidade quando o perfil de futebol não tem uma e mostra o erro da API', async () => {
    mockApi({ 'POST /teams': apiError(422, 'Selecione uma cidade do catálogo.') })
    const ui = userEvent.setup()
    renderForm({ profiles: [] })
    await ui.type(screen.getByLabelText('Nome do time'), 'Unidos do Lago')
    expect(screen.getByText('Escolha a cidade do time')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Criar time' }).hasAttribute('disabled')).toBe(true)
    await ui.click(screen.getByRole('button', { name: 'Escolher cidade' }))
    await ui.click(within(screen.getByRole('dialog', { name: 'Cidade do time' })).getByRole('button', { name: 'Brasília · DF' }))
    await ui.click(screen.getByRole('button', { name: 'Criar time' }))
    expect(await findToast('Selecione uma cidade do catálogo.')).toBeTruthy()
  })
})

describe('Editar time (F2)', () => {
  it('edita o nome e troca o brasão: envia só o nome alterado e depois o brasão', async () => {
    const current = team({ crest_url: '/api/v1/teams/10/crest?v=3' })
    const api = mockApi({
      'GET /teams/10': current,
      'PATCH /teams/10': { ...current, name: 'Ferrugem Futebol Clube' },
      'PUT /teams/10/crest': { ...current, name: 'Ferrugem Futebol Clube', crest_url: '/api/v1/teams/10/crest?v=4' },
    })
    const ui = userEvent.setup()
    const { container, onDone } = renderForm({ teamId: 10 })
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar time' })).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Salvar alterações' })
    expect(save.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText(/Você será o representante/)).toBeNull()
    await ui.clear(screen.getByLabelText('Nome do time'))
    await ui.type(screen.getByLabelText('Nome do time'), 'Ferrugem Futebol Clube')
    await pickCrest(container, ui)
    await ui.click(save)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ crest_url: '/api/v1/teams/10/crest?v=4' })))
    expect(api.find('PATCH', '/teams/10')[0].body).toEqual({ name: 'Ferrugem Futebol Clube' })
    expect(api.find('PUT', '/teams/10/crest')).toHaveLength(1)
  })

  it('remove o brasão ao salvar e encerra o time com confirmação', async () => {
    const current = team({ crest_url: '/api/v1/teams/10/crest?v=3' })
    const api = mockApi({ 'GET /teams/10': current, 'DELETE /teams/10/crest': undefined, 'POST /teams/10/close': undefined })
    const ui = userEvent.setup()
    const { onDone, onClosed } = renderForm({ teamId: 10 })
    await ui.click(await screen.findByRole('button', { name: 'Remover' }))
    expect(screen.getByText('Enviar brasão')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ crest_url: null })))
    expect(api.find('DELETE', '/teams/10/crest')).toHaveLength(1)
    expect(api.find('PATCH', '/teams/10')).toHaveLength(0)

    await ui.click(screen.getByRole('button', { name: 'Encerrar time' }))
    const sheet = screen.getByRole('dialog', { name: 'Encerrar Ferrugem FC' })
    expect(sheet.textContent).toContain('O histórico de partidas e o ranking continuam registrados.')
    await ui.click(within(sheet).getByRole('button', { name: 'Encerrar time' }))
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ id: 10 })))
    expect(api.find('POST', '/teams/10/close')[0].body).toEqual({})
  })

  it('não deixa um membro editar e mostra o erro de carregamento', async () => {
    mockApi({ 'GET /teams/10': team({ my_role: 'membro' }), 'GET /teams/11': apiError(404, 'Time não encontrado.') })
    renderForm({ teamId: 10 })
    expect((await screen.findByRole('alert')).textContent).toBe('Só representantes podem editar o time.')
    cleanup()
    renderForm({ teamId: 11 })
    expect((await screen.findByRole('alert')).textContent).toContain('Time não encontrado.')
  })

  it('recusa arquivo grande demais sem abrir o recorte', () => {
    mockApi({})
    const { container } = renderForm()
    fireEvent.change(container.querySelector('#team-crest-file')!, { target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' })] } })
    expect(screen.getByRole('alert').textContent).toContain('até 5 MiB')
    expect(screen.queryByRole('dialog', { name: 'Ajustar brasão' })).toBeNull()
  })
})
