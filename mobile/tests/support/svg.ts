// Substitui o `react-native-svg` nos testes (Node, sem Metro): o pacote real usa sintaxe Flow que o Node não lê.
// Cada forma vira um elemento com o mesmo nome (a mesma simulação de `svgMock` em `native.ts`); um teste que chama
// `vi.mock('react-native-svg', …)` continua trocando por conta própria.
import { svgMock } from './native'

const mock = svgMock()
export default mock.default
export const { Svg, SvgXml, Circle, Path, Rect, Text } = mock
