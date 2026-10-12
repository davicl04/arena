import { describe, expect, it } from 'vitest'
import { positions } from '../src/api/client'
import {
  activeNavFor, footballFormat, footballFormats, placementRequired, positionOptions, positionShort, rankingTiers,
  runDistances, shownTier, teamRole, teamRoles, tiers,
} from '../src/data/arena'
import type { Screen, TierKey } from '../src/data/arena'
import { teamInitials } from '../src/utils/teamInitials'

describe('mapeamentos da etapa 1', () => {
  it('deriva os elos por chave de rankingTiers, na mesma ordem', () => {
    expect(Object.keys(tiers)).toEqual(rankingTiers.map(tier => tier.image))
    expect(tiers.lendario).toEqual({ key: 'lendario', name: 'Lendário', image: '/images/brand/lendario.svg' })
  })

  it('só exibe elo com a classificação completa', () => {
    expect(placementRequired).toBe(3)
    expect(shownTier('ouro', 3)).toBe('ouro')
    expect(shownTier('ouro', 2)).toBeNull()
    expect(shownTier('ouro', 1, 1)).toBe('ouro')
    expect(shownTier(null, 10)).toBeNull()
    expect(shownTier(undefined, 10)).toBeNull()
    expect(shownTier('ferro' as TierKey, 10)).toBeNull()
  })

  it('descreve os formatos do futebol com o elenco em campo', () => {
    expect(footballFormats.map(format => `${format.label} ${format.size}`)).toEqual(['Futsal 5×5', 'Society 7×7', 'Campo 11×11'])
    expect(footballFormats.every(format => format.size === `${format.players}×${format.players}`)).toBe(true)
    expect(footballFormat.society.players).toBe(7)
  })

  it('soma as siglas às posições sem duplicar os rótulos', () => {
    expect(positionOptions.map(position => position.short)).toEqual(['GOL', 'DEF', 'MEI', 'ATA'])
    expect(positionOptions.map(position => position.label)).toEqual(positions.map(position => position.label))
    expect(positionShort.meio_campo).toBe('MEI')
  })

  it('lista as distâncias da corrida e os papéis do time', () => {
    expect(runDistances.map(distance => distance.label)).toEqual(['3 km', '5 km', '10 km', '21 km', '42 km'])
    expect(runDistances.find(distance => distance.value === 42)?.km).toBe(42.195)
    expect(teamRoles.map(role => role.label)).toEqual(['Representante', 'Membro'])
    expect(teamRole.membro.viewer).toBe('você é membro')
    expect(teamRole.representante.viewer).toBe('você representa')
  })

  it('gera as iniciais do escudo neutro pela regra do servidor', () => {
    expect(teamInitials('Leões do Cerrado')).toBe('LC')
    expect(teamInitials('  Ferrugem   FC ')).toBe('FF')
    expect(teamInitials('Unidos do Guará Futebol')).toBe('UF')
    expect(teamInitials('águias')).toBe('ÁG')
    expect(teamInitials('Do E')).toBe('DE')
    expect(teamInitials('   ')).toBe('?')
  })
})

describe('aba acesa na navegação', () => {
  it.each<[Screen, Screen, Screen]>([
    ['home', 'home', 'home'],
    ['ranking', 'ranking', 'ranking'],
    ['community', 'community', 'community'],
    ['notifications', 'home', 'home'],
    ['notifications', 'profile', 'profile'],
    ['menu', 'profile', 'profile'],
    ['sports', 'profile', 'profile'],
    ['moderation', 'profile', 'profile'],
    ['organizer-request', 'profile', 'profile'],
    ['admin-organizer-requests', 'profile', 'profile'],
    ['teams', 'play', 'play'],
    ['team-form', 'play', 'play'],
    ['team-invite', 'play', 'play'],
    ['join', 'join', 'play'],
    ['user-profile', 'community', 'community'],
    ['user-profile', 'play', 'play'],
    ['user-profile', 'join', 'play'],
    ['user-profile', 'menu', 'profile'],
    ['connections', 'admin-organizer-requests', 'profile'],
    ['connections', 'notifications', 'home'],
    ['connections', 'sports', 'home'],
  ])('%s com a pilha a partir de %s acende %s', (screen, root, active) => {
    expect(activeNavFor(screen, root)).toBe(active)
  })
})
