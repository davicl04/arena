import { describe, expect, it } from 'vitest'
import type { Sport } from '../src/api/client'
import { SELO_COROA, SELOS_GEOMETRIA, SELO_VIEWBOX, SIMBOLO_VIEWBOX } from '../src/data/selos'

// Dado gerado por scripts/gerar_selos.py: confere o formato que os componentes de selo consomem.
const sports: Sport[] = ['futebol', 'tenis', 'corrida']
const caminhos = [SELO_COROA, ...sports.flatMap(sport => Object.values(SELOS_GEOMETRIA[sport]))]

describe('geometria dos selos de modalidade', () => {
  it('cobre as três modalidades com símbolo e símbolo com aro', () => {
    expect(Object.keys(SELOS_GEOMETRIA).sort()).toEqual([...sports].sort())
    expect(SELO_VIEWBOX).toBe('-256 -256 512 512')
    expect(SIMBOLO_VIEWBOX).toBe('-172 -172 344 344')
  })

  it('usa só caminhos sem cor, com comandos aceitos pelo react-native-svg e pelos navegadores', () => {
    for (const d of caminhos) {
      expect(d).toMatch(/^M[-\d.]/)
      expect(d).toMatch(/^[MachlvzZ\d\s.-]+$/)
    }
  })

  it('desenha o aro com r ≈ 0,92 da caixa e traço ≈ 6,6% do diâmetro, igual nas três modalidades', () => {
    // Coroa circular de 219 a 253 (raio 236, traço 34 na caixa de 512).
    const aro = 'M253 0a253 253 0 0 1 -506 0a253 253 0 0 1 506 0zM219 0a219 219 0 0 0 -438 0a219 219 0 0 0 438 0z'
    for (const sport of sports) expect(SELOS_GEOMETRIA[sport].simboloComAro.startsWith(aro)).toBe(true)
  })

  it('mantém cada selo (coroa e símbolo) em poucos KB', () => {
    for (const sport of sports) expect(SELO_COROA.length + SELOS_GEOMETRIA[sport].simbolo.length).toBeLessThan(12_000)
  })
})
