// Gera `src/assets/brand-svgs.ts` a partir dos SVGs da marca da web (`web/public/images/brand/`).
// O Metro não importa SVG sem um transformer; as strings são renderizadas com `SvgXml` (react-native-svg).
// Uso (em mobile/): npm run generate:brand
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(here, '..', '..', 'web', 'public', 'images', 'brand')
const target = path.join(here, '..', 'src', 'assets', 'brand-svgs.ts')

/** Arquivo da web → chave do módulo. O Coliseu e a muralha usam `currentColor`; os cinco elos trazem a própria cor. */
const files = [
  ['coliseum', 'coliseum'],
  ['arena-wall', 'arenaWall'],
  ['bronze', 'bronze'],
  ['prata', 'prata'],
  ['ouro', 'ouro'],
  ['diamante', 'diamante'],
  ['lendario', 'lendario'],
]

const entries = files.map(([file, key]) => {
  const svg = readFileSync(path.join(source, `${file}.svg`), 'utf8').trim()
  return `  ${key}: ${JSON.stringify(svg)},`
})

const output = `// Gerado por scripts/generate-brand-svgs.mjs a partir de web/public/images/brand/*.svg. Não edite à mão:
// rode \`npm run generate:brand\` em mobile/ depois de alterar os SVGs da web.
export const brandSvgs = {
${entries.join('\n')}
} as const

export type BrandSvgName = keyof typeof brandSvgs
`

writeFileSync(target, output, 'utf8')
console.log(`Gerado ${path.relative(process.cwd(), target)} com ${files.length} SVGs.`)
