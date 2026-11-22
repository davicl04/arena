import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { City, Profile, User } from '../src/api/client'
import SportCard from '../src/components/SportCard'
import { CitySheet } from '../src/components/teams/CitySheet'
import ArenaPage from '../src/pages/ArenaPage'
import { playBoard, standings } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'
import { apiError, goiania, mockApi } from './teams-fixtures'
import type { Call } from './teams-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

/*
 * Catálogo nacional na web (ticket 03): quem escolhe cidade busca no servidor (`GET /cities?q=`, 2+ caracteres, atraso de
 * digitação, até 20 "Nome · UF", vazio e erro com "Tentar novamente"); quem nomeia usa o `city` das respostas. Valparaíso
 * de Goiás (5221858) fica fora das 100 primeiras cidades em ordem alfabética: só aparece pela busca ou pelo `city`.
 */

const valparaiso: City = { id: 5221858, name: 'Valparaíso de Goiás', state: 'GO' }
const many: City[] = Array.from({ length: 20 }, (_, index) => ({ id: 5200000 + index, name: `Goiás ${index + 1}`, state: 'GO' }))
const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
/** Chamada a `GET /cities` sem `q` nem `ids`: a lista global, que a web não usa mais. */
const globalList = (calls: Call[]) => calls.filter(call => call.method === 'GET' && /^\/cities(\?(?!.*\b(q|ids)=).*)?$/.test(call.path))

function renderSheet(selected: City | null = null) {
  const onSelect = vi.fn()
  render(<CitySheet selected={selected} onSelect={onSelect} onClose={vi.fn()} />)
  const sheet = screen.getByRole('dialog', { name: 'Cidade do time' })
  return { onSelect, sheet, input: within(sheet).getByLabelText('Buscar cidade') }
}

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('busca de cidade no servidor', () => {
  it('só consulta com 2 ou mais caracteres, depois da digitação, e mostra até 20 "Nome · UF"', async () => {
    const api = mockApi({ 'GET /cities?q=goi': many })
    const ui = userEvent.setup()
    const { sheet, input, onSelect } = renderSheet()
    expect(document.activeElement).toBe(input)
    await ui.type(input, 'g')
    expect(within(sheet).getByRole('status').textContent).toBe('Digite pelo menos 2 letras do nome ou da UF.')
    await ui.type(input, 'oi')
    expect(within(sheet).getByRole('status').textContent).toBe('Buscando cidades…')
    const list = await within(sheet).findByRole('list', { name: 'Cidades' })
    // A digitação seguida faz uma única consulta, com o texto final.
    expect(api.calls.map(call => call.path)).toEqual(['/cities?q=goi'])
    expect(within(list).getAllByRole('button')).toHaveLength(20)
    expect(within(sheet).getByRole('status').textContent).toBe('20 cidades encontradas.')
    await ui.click(within(list).getByRole('button', { name: 'Goiás 7 · GO' }))
    expect(onSelect).toHaveBeenCalledWith(many[6])
  })

  it('mostra "Nenhuma cidade encontrada." quando a busca não acha nada', async () => {
    mockApi({ 'GET /cities?q=xyz': [] })
    const ui = userEvent.setup()
    const { sheet, input } = renderSheet()
    await ui.type(input, 'xyz')
    await waitFor(() => expect(within(sheet).getByRole('status').textContent).toBe('Nenhuma cidade encontrada.'))
    expect(within(sheet).queryByRole('list', { name: 'Cidades' })).toBeNull()
  })

  it('mostra o erro de carregamento e busca de novo com "Tentar novamente"', async () => {
    let attempts = 0
    const api = mockApi({ 'GET /cities?q=goi': () => ++attempts === 1 ? apiError(500, 'Serviço indisponível.') : [goiania] })
    const ui = userEvent.setup()
    const { sheet, input } = renderSheet()
    await ui.type(input, 'goi')
    const alert = await within(sheet).findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível buscar as cidades')
    expect(alert.textContent).toContain('Serviço indisponível.')
    await ui.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await within(sheet).findByRole('button', { name: 'Goiânia · GO' })).toBeTruthy()
    expect(within(sheet).queryByRole('alert')).toBeNull()
    expect(api.find('GET', '/cities?q=goi')).toHaveLength(2)
  })

  it('descarta a resposta atrasada de um texto anterior', async () => {
    const pending: Record<string, (value: City[]) => void> = {}
    const api = mockApi({
      'GET /cities?q=go': () => new Promise<City[]>(resolve => { pending.go = resolve }),
      'GET /cities?q=goi': () => new Promise<City[]>(resolve => { pending.goi = resolve }),
    })
    const ui = userEvent.setup()
    const { sheet, input } = renderSheet()
    await ui.type(input, 'go')
    await waitFor(() => expect(api.calls).toHaveLength(1))
    await ui.type(input, 'i')
    await waitFor(() => expect(api.calls).toHaveLength(2))
    pending.goi([goiania])
    expect(await within(sheet).findByRole('button', { name: 'Goiânia · GO' })).toBeTruthy()
    pending.go([valparaiso])
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(within(sheet).queryByRole('button', { name: /Valparaíso/ })).toBeNull()
    expect(within(sheet).getAllByRole('button', { name: /· GO$/ })).toHaveLength(1)
  })

  it('a cidade já escolhida aparece marcada mesmo fora dos resultados', async () => {
    mockApi({ 'GET /cities?q=goi': [goiania] })
    const ui = userEvent.setup()
    const { sheet, input } = renderSheet(valparaiso)
    expect(within(sheet).getByRole('button', { name: 'Valparaíso de Goiás · GO', pressed: true })).toBeTruthy()
    await ui.type(input, 'goi')
    await within(sheet).findByRole('button', { name: 'Goiânia · GO', pressed: false })
    expect(within(sheet).getAllByRole('button', { pressed: true }).map(button => button.textContent)).toEqual(['Valparaíso de Goiás · GO'])
  })
})

describe('formulário da modalidade (SportCard) com a busca', () => {
  it('salva um município fora das 100 primeiras pela busca e nomeia a cidade pelo `city` do perfil', async () => {
    const api = mockApi({ 'GET /cities?q=valpa': [{ id: 3556305, name: 'Valparaíso', state: 'SP' }, valparaiso] })
    const onSave = vi.fn().mockResolvedValue(undefined)
    const ui = userEvent.setup()
    const view = renderWithToaster(<SportCard sport="tenis" label="Tênis" symbol="" description="Quadras" onSave={onSave} onExpired={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: /Adicionar tênis/ }))
    // Sem cidade, o envio não chega ao servidor.
    await ui.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha a cidade na busca.')
    expect(onSave).not.toHaveBeenCalled()
    await ui.type(screen.getByLabelText('Cidade'), 'valpa')
    await ui.click(await screen.findByRole('button', { name: 'Valparaíso de Goiás · GO' }))
    expect(screen.queryByRole('alert')).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('tenis', { city_id: 5221858, position: null, looking_for: false }))
    expect(await findToast('Perfil salvo.')).toBeTruthy()

    const saved: Profile = { id: 9, sport: 'tenis', city_id: valparaiso.id, city: valparaiso, position: null, looking_for: false, is_public: false, level: null }
    view.rerender(<><SportCard sport="tenis" label="Tênis" symbol="" description="Quadras" profile={saved} onSave={onSave} onExpired={vi.fn()} /></>)
    expect(screen.getByText('Valparaíso de Goiás · GO')).toBeTruthy()
    expect(api.calls.map(call => call.path)).toEqual(['/cities?q=valpa'])
  })
})

describe('ArenaPage sem a lista global de cidades', () => {
  it('nomeia a cidade do perfil pelo `city` no Jogar e nas modalidades, e salva pela busca, sem GET /cities sem q', async () => {
    const football: Profile = { id: 1, sport: 'futebol', city_id: valparaiso.id, city: valparaiso, position: 'atacante', looking_for: false, is_public: false, level: null }
    const tennis: Profile = { id: 2, sport: 'tenis', city_id: goiania.id, city: goiania, position: null, looking_for: true, is_public: false, level: null }
    const api = mockApi({
      'GET /me/sports-profiles': [football],
      'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
      'GET /me/standings': standings([]),
      'GET /me/play': playBoard(),
      'GET /me/run-bests': { items: [] },
      'GET /cities?q=goi': [goiania],
      'PUT /me/sports-profiles/tenis': tennis,
    })
    const ui = userEvent.setup()
    render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)
    await ui.click(within(await screen.findByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'JOGAR' }))
    await ui.click(await screen.findByRole('button', { name: 'Cidade do perfil de Futebol: Valparaíso de Goiás. Alterar em Suas modalidades' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Suas modalidades' })).toBeTruthy()
    expect(screen.getByText('Valparaíso de Goiás · GO')).toBeTruthy()

    await ui.click(screen.getByRole('button', { name: /Adicionar tênis/ }))
    await ui.type(screen.getByLabelText('Cidade'), 'goi')
    await ui.click(await screen.findByRole('button', { name: 'Goiânia · GO' }))
    await ui.click(screen.getByLabelText('Estou procurando oportunidades'))
    await ui.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    expect(await findToast('Perfil salvo.')).toBeTruthy()
    expect(api.find('PUT', '/me/sports-profiles/tenis')[0].body).toEqual({ city_id: goiania.id, position: null, looking_for: true })
    expect(await screen.findByText('Goiânia · GO')).toBeTruthy()
    expect(globalList(api.calls)).toEqual([])
  })
})
