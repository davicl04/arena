/** Pontos (largura 30, altura 100) do I com serifas retas no alto e na base. */
const I_POINTS = [[0, 0], [30, 0], [30, 9], [21, 9], [21, 91], [30, 91], [30, 100], [0, 100], [0, 91], [9, 91], [9, 9], [0, 9]]
/** Pontos (largura 54, altura 100) do V. */
const V_POINTS = [[0, 0], [16, 0], [27, 72], [38, 0], [54, 0], [34, 100], [20, 100]]
const GAP = 10
const LETTERS: Record<1 | 2 | 3 | 4, ('I' | 'V')[]> = { 1: ['I'], 2: ['I', 'I'], 3: ['I', 'I', 'I'], 4: ['I', 'V'] }

/** Polígonos das letras do numeral, lado a lado, e a largura total. */
function numeralShape(value: 1 | 2 | 3 | 4) {
  const polygons: string[] = []
  let x = 0
  for (const letter of LETTERS[value]) {
    polygons.push((letter === 'I' ? I_POINTS : V_POINTS).map(([px, py]) => `${px + x},${py}`).join(' '))
    x += (letter === 'I' ? 30 : 54) + GAP
  }
  return { polygons, width: x - GAP }
}

/*
 * Numeral romano (I a IV) desenhado em SVG próprio, sem depender do contorno de uma fonte: cada letra é um polígono
 * com serifas retas, de traço dourado; a coluna aberta preenche o numeral (`.landing-numeral` em ui.css). Decorativo:
 * fica dentro da decoração da coluna, oculta para leitores de tela.
 */
export function RomanNumeral({ value }: { value: 1 | 2 | 3 | 4 }) {
  const { polygons, width } = numeralShape(value)
  return (
    <svg className="landing-numeral" viewBox={`-2 -2 ${width + 4} 104`} preserveAspectRatio="xMinYMin meet" focusable="false">
      {polygons.map((points, index) => <polygon key={index} points={points} />)}
    </svg>
  )
}
