import { describe, expect, it } from 'vitest'
import { availabilityMessage, connectionsText, mutualFollowersText, normalizeUsername, usernameProblem } from '../src/utils/profile'

describe('nome de usuário', () => {
  it('normaliza espaços, @ inicial e maiúsculas', () => {
    expect(normalizeUsername('  @Atleta.Um ')).toBe('atleta.um')
  })

  it.each(['abc', 'a.b', 'ana_99', 'a'.repeat(30)])('aceita %s', value => {
    expect(usernameProblem(value)).toBeNull()
  })

  it.each([
    ['', 'Informe'], ['ab', 'pelo menos 3'], ['a'.repeat(31), 'no máximo 30'], ['joão', 'minúsculas sem acento'],
    ['com espaço', 'minúsculas sem acento'], ['.ana', 'começar nem terminar'], ['ana.', 'começar nem terminar'], ['a..b', 'dois pontos'],
  ])('rejeita "%s"', (value, text) => {
    expect(usernameProblem(value)).toContain(text)
  })

  it.each([
    ['current', 'já é o seu'], ['taken', 'em uso'], ['reserved', 'reservado'], ['invalid', 'inválido'], [null, 'disponível'],
  ] as const)('descreve a disponibilidade %s', (reason, text) => {
    expect(availabilityMessage({ available: reason === null || reason === 'current', reason, suggestions: [] })).toContain(text)
  })
})

describe('textos do perfil', () => {
  const people = [{ name: 'Ana' }, { name: 'Bia' }]
  it('monta o texto de seguidores em comum', () => {
    expect(mutualFollowersText([], 0)).toBeNull()
    expect(mutualFollowersText(people, 0)).toBeNull()
    expect(mutualFollowersText(people.slice(0, 1), 1)).toBe('Ana, que você segue, também segue esta conta.')
    expect(mutualFollowersText(people, 2)).toBe('Ana e Bia, que você segue, também seguem esta conta.')
    expect(mutualFollowersText(people, 5)).toBe('Ana, Bia e mais 3 que você segue também seguem esta conta.')
    expect(mutualFollowersText(people.slice(0, 1), 4)).toBe('Ana e mais 3 que você segue também seguem esta conta.')
  })

  it('usa singular e plural nas contagens', () => {
    expect(connectionsText(1, 0)).toBe('1 seguidor · 0 seguindo')
    expect(connectionsText(3, 2)).toBe('3 seguidores · 2 seguindo')
  })
})
