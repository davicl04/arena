import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { City, Profile, User } from '../src/api/client'
import ArenaPage from '../src/pages/ArenaPage'
import { playBoard, standings } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'
import { apiError, goiania, mockApi } from './teams-fixtures'
import type { Call } from './teams-fixtures'
import { findToast, queryToast } from './toast-utils'

/*
 * Tela "Suas modalidades" (ticket 04): faixas por modalidade e a folha passo a passo (cidade pela busca → posição no
 * futebol → revisão), com o `PUT /me/sports-profiles/{sport}` existente e o `toast.success` do projeto.
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const valparaiso: City = { id: 5221858, name: 'Valparaíso de Goiás', state: 'GO' }
const profile = (overrides: Partial<Profile> & Pick<Profile, 'sport'>): Profile =>
  ({ id: 7, city_id: goiania.id, city: goiania, position: null, looking_for: false, is_public: false, level: null, ...overrides })
/** O `PUT` devolve o perfil com a cidade escolhida (o servidor junta `city`). */
const saved = (sport: Profile['sport'], cities: City[] = [goiania, valparaiso]) => (call: Call) => {
  const body = call.body as { city_id: number; position: Profile['position']; looking_for: boolean }
  const city = cities.find(item => item.id === body.city_id) ?? goiania
  return profile({ sport, ...body, city })
}

function renderSports(profiles: Profile[], routes: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /me/sports-profiles': profiles,
    'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
    'GET /me/standings': standings([]),
    'GET /me/play': playBoard(),
    'GET /me/run-bests': { items: [] },
    'GET /cities?q=goi': [goiania],
    'GET /cities?q=valpa': [valparaiso],
    ...routes,
  })
  const ui = userEvent.setup()
  render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
  const open = async () => {
    await ui.click(await screen.findByRole('button', { name: 'Minha cidade' }))
    await screen.findByRole('heading', { level: 2, name: 'Onde você joga?' })
  }
  return { api, ui, open }
}
const sheet = () => screen.getByRole('dialog')
const stepHeading = () => within(sheet()).getByRole('heading', { level: 3 })
const puts = (calls: Call[]) => calls.filter(call => call.method === 'PUT')

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Suas modalidades: faixas e folha passo a passo', () => {
  it('ativa o futebol em Cidade → Posição → Revisão, envia o PUT, mostra o toast e deixa a faixa ativa', async () => {
    const { api, ui, open } = renderSports([], { 'PUT /me/sports-profiles/futebol': saved('futebol') })
    await open()
    expect(screen.getByText('0 de 3 ativas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tênis, ativar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corrida, ativar' })).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Futebol, ativar' }))

    // Passo 1: a cidade pela busca do servidor; sem cidade, "Continuar" fica desabilitado.
    expect(within(sheet()).getByText('1 de 3')).toBeTruthy()
    expect(stepHeading().textContent).toBe('Em que cidade você joga? Passo 1 de 3.')
    expect(document.activeElement).toBe(stepHeading())
    expect(within(sheet()).queryByRole('button', { name: 'Voltar' })).toBeNull()
    const next = within(sheet()).getByRole('button', { name: 'Continuar' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'valpa')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Valparaíso de Goiás · GO' }))
    expect(within(sheet()).getByText('Escolhida por você')).toBeTruthy()
    expect(next.disabled).toBe(false)
    await ui.click(next)

    // Passo 2: a posição em grupo de rádio, sempre opcional; o foco vai ao título.
    expect(stepHeading().textContent).toBe('Onde você gosta de jogar? Passo 2 de 3.')
    expect(document.activeElement).toBe(stepHeading())
    const group = within(sheet()).getByRole('radiogroup', { name: 'Posição preferida' })
    expect(within(group).getAllByRole('radio').map(radio => radio.getAttribute('aria-label')))
      .toEqual(['Goleiro', 'Defesa', 'Meio de campo', 'Atacante', 'Ainda não sei'])
    expect(within(group).getByRole('radio', { name: 'Ainda não sei', checked: true })).toBeTruthy()
    await ui.click(within(group).getByRole('radio', { name: 'Meio de campo' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))

    // Passo 3: revisão com a chave desligada no perfil novo.
    expect(stepHeading().textContent).toBe('Tudo certo? Passo 3 de 3.')
    const looking = within(sheet()).getByRole('switch', { name: 'Procurando oportunidades' })
    expect(looking.getAttribute('aria-checked')).toBe('false')
    await ui.click(looking)
    expect(puts(api.calls)).toEqual([])
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar futebol' }))

    expect(await findToast('Futebol ativado.')).toBeTruthy()
    expect(await findToast('Valparaíso de Goiás · GO · Meio de campo · Procurando')).toBeTruthy()
    expect(api.find('PUT', '/me/sports-profiles/futebol').map(call => call.body)).toEqual([{ city_id: valparaiso.id, position: 'meio_campo', looking_for: true }])
    expect(screen.queryByRole('dialog')).toBeNull()
    const band = screen.getByRole('button', { name: 'Futebol, ativa, editar' })
    expect(band.textContent).toContain('● Ativa')
    expect(band.textContent).toContain('Valparaíso de Goiás · GO · Meio de campo · Procurando')
    expect(screen.getByText('1 de 3 ativas')).toBeTruthy()
  })

  it('tênis e corrida vão de Cidade a Revisão, sem o passo nem a linha da posição', async () => {
    const { api, ui, open } = renderSports([], { 'PUT /me/sports-profiles/tenis': saved('tenis') })
    await open()
    await ui.click(screen.getByRole('button', { name: 'Corrida, ativar' }))
    expect(within(sheet()).getByText('1 de 2')).toBeTruthy()
    await ui.keyboard('{Escape}')
    await ui.click(screen.getByRole('button', { name: 'Tênis, ativar' }))
    expect(within(sheet()).getByText('1 de 2')).toBeTruthy()
    await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'goi')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Goiânia · GO' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    expect(stepHeading().textContent).toBe('Tudo certo? Passo 2 de 2.')
    expect(within(sheet()).queryByRole('button', { name: 'Alterar posição' })).toBeNull()
    expect(within(sheet()).getByText('Goiânia · GO')).toBeTruthy()
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar tênis' }))
    expect(await findToast('Tênis ativado.')).toBeTruthy()
    expect(await findToast('Goiânia · GO · Sem procura')).toBeTruthy()
    expect(api.find('PUT', '/me/sports-profiles/tenis')[0].body).toEqual({ city_id: goiania.id, position: null, looking_for: false })
    expect(screen.getByRole('button', { name: 'Tênis, ativa, editar' })).toBeTruthy()
  })

  it('"Alterar" volta ao passo da cidade ou da posição, "Ainda não sei" grava a posição nula e "Trocar" volta à busca', async () => {
    const { api, ui, open } = renderSports([], { 'PUT /me/sports-profiles/futebol': saved('futebol') })
    await open()
    await ui.click(screen.getByRole('button', { name: 'Futebol, ativar' }))
    await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'goi')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Goiânia · GO' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('radio', { name: 'Atacante' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))

    await ui.click(within(sheet()).getByRole('button', { name: 'Alterar posição' }))
    expect(stepHeading().textContent).toMatch(/^Onde você gosta de jogar\?/)
    expect(document.activeElement).toBe(stepHeading())
    // As setas movem a escolha e o foco dentro do grupo.
    within(sheet()).getByRole('radio', { name: 'Atacante', checked: true }).focus()
    await ui.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(within(sheet()).getByRole('radio', { name: 'Ainda não sei', checked: true }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    expect(within(sheet()).getByText('Ainda não sei')).toBeTruthy()

    await ui.click(within(sheet()).getByRole('button', { name: 'Alterar cidade' }))
    expect(stepHeading().textContent).toMatch(/^Em que cidade você joga\?/)
    await ui.click(within(sheet()).getByRole('button', { name: 'Trocar cidade: Goiânia · GO' }))
    const search = within(sheet()).getByLabelText('Buscar cidade')
    expect(document.activeElement).toBe(search)
    await ui.type(search, 'valpa')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Valparaíso de Goiás · GO' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar futebol' }))
    await waitFor(() => expect(api.find('PUT', '/me/sports-profiles/futebol').map(call => call.body))
      .toEqual([{ city_id: valparaiso.id, position: null, looking_for: false }]))
  })

  it('perfil existente abre no passo 1 com os valores atuais e salva com "Perfil salvo."', async () => {
    const football = profile({ sport: 'futebol', city: valparaiso, city_id: valparaiso.id, position: 'goleiro', looking_for: true })
    const { api, ui, open } = renderSports([football], { 'PUT /me/sports-profiles/futebol': saved('futebol') })
    await open()
    expect(screen.getByText('1 de 3 ativas')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Futebol, ativa, editar' }))
    expect(stepHeading().textContent).toMatch(/^Em que cidade você joga\?/)
    expect(within(sheet()).getByText('Valparaíso de Goiás · GO')).toBeTruthy()
    expect(within(sheet()).getByRole('button', { name: 'Trocar cidade: Valparaíso de Goiás · GO' })).toBeTruthy()
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    expect(within(sheet()).getByRole('radio', { name: 'Goleiro', checked: true })).toBeTruthy()
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    const looking = within(sheet()).getByRole('switch', { name: 'Procurando oportunidades' })
    expect(looking.getAttribute('aria-checked')).toBe('true')
    await ui.click(looking)
    expect(within(sheet()).queryByRole('button', { name: 'Ativar futebol' })).toBeNull()
    await ui.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    expect(await findToast('Perfil salvo.')).toBeTruthy()
    expect(await findToast('Valparaíso de Goiás · GO · Goleiro · Sem procura')).toBeTruthy()
    expect(api.find('PUT', '/me/sports-profiles/futebol')[0].body).toEqual({ city_id: valparaiso.id, position: 'goleiro', looking_for: false })
    expect(screen.getByRole('button', { name: 'Futebol, ativa, editar' }).textContent).toContain('Sem procura')
  })

  it('o 422 fica na folha, na revisão; os demais erros seguem para o toast de erro, com a folha aberta', async () => {
    let attempt = 0
    const { ui, open } = renderSports([], {
      'PUT /me/sports-profiles/tenis': () => ++attempt === 1 ? apiError(422, 'Selecione uma cidade do catálogo.') : apiError(500, 'Falha ao salvar agora.'),
    })
    await open()
    await ui.click(screen.getByRole('button', { name: 'Tênis, ativar' }))
    await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'goi')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Goiânia · GO' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar tênis' }))
    const alert = await within(sheet()).findByRole('alert')
    expect(alert.textContent).toBe('Selecione uma cidade do catálogo.')
    expect(queryToast('Selecione uma cidade do catálogo.')).toBeNull()

    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar tênis' }))
    const toastText = await findToast('Falha ao salvar agora.')
    expect(toastText.closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    expect(within(sheet()).queryByRole('alert')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tênis, ativar' })).toBeTruthy()
  })

  it('fechar a folha sem concluir (Esc, fundo ou Fechar) não salva nada', async () => {
    const { api, ui, open } = renderSports([])
    await open()
    const reach = async () => {
      await ui.click(screen.getByRole('button', { name: 'Tênis, ativar' }))
      await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'goi')
      await ui.click(await within(sheet()).findByRole('button', { name: 'Goiânia · GO' }))
      await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    }
    await reach()
    await ui.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await reach()
    await ui.click(screen.getByTestId('sheet-scrim'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await reach()
    await ui.click(within(sheet()).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(puts(api.calls)).toEqual([])
    expect(screen.getByRole('button', { name: 'Tênis, ativar' })).toBeTruthy()
    expect(screen.getByText('0 de 3 ativas')).toBeTruthy()
    // Reabrir começa do zero: o rascunho fechado não volta.
    await ui.click(screen.getByRole('button', { name: 'Tênis, ativar' }))
    expect(within(sheet()).queryByText('Escolhida por você')).toBeNull()
  })
})
