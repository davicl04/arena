import { describe, expect, it } from 'vitest'
import { brandSvgs } from '../src/assets/brand-svgs'
import corrida from '../assets/sports/corrida.png'
import futebol from '../assets/sports/futebol.png'
import tenis from '../assets/sports/tenis.png'
import arenaWall from '../../web/public/images/brand/arena-wall.svg?raw'
import bronze from '../../web/public/images/brand/bronze.svg?raw'
import coliseum from '../../web/public/images/brand/coliseum.svg?raw'
import diamante from '../../web/public/images/brand/diamante.svg?raw'
import lendario from '../../web/public/images/brand/lendario.svg?raw'
import ouro from '../../web/public/images/brand/ouro.svg?raw'
import prata from '../../web/public/images/brand/prata.svg?raw'

const web: Record<keyof typeof brandSvgs, string> = { coliseum, arenaWall, bronze, prata, ouro, diamante, lendario }

describe('assets da marca no Expo', () => {
  it.each(Object.keys(web) as (keyof typeof web)[])('o módulo gerado de %s reflete o SVG da web (rode npm run generate:brand se divergir)', key => {
    expect(brandSvgs[key].startsWith('<svg')).toBe(true)
    expect(brandSvgs[key]).toBe(web[key].trim())
  })

  it('o Coliseu e a muralha usam a cor atual; os cinco elos trazem a própria cor', () => {
    expect(brandSvgs.coliseum).toContain('currentColor')
    expect(brandSvgs.arenaWall).toContain('currentColor')
    for (const tier of ['bronze', 'prata', 'ouro', 'diamante', 'lendario'] as const) expect(brandSvgs[tier]).not.toContain('currentColor')
  })

  it('os ícones provisórios das modalidades estão em assets/sports', () => {
    for (const icon of [futebol, tenis, corrida]) expect(icon).toBeTruthy()
  })
})
