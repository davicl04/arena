/* Conectivos ignorados nas iniciais ("Leões do Cerrado" → "LC"). */
const connectives = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

/**
 * Iniciais do escudo neutro, na mesma regra do servidor (`team_initials`): primeira letra da primeira e da
 * última palavra, sem conectivos; com uma palavra só, as duas primeiras letras. Serve à prévia ao vivo
 * do Criar time; nas respostas da API, prefira o campo `initials`.
 */
export function teamInitials(name: string): string {
  const all = name.split(/\s+/).filter(Boolean)
  const words = all.filter(word => !connectives.has(word.toLowerCase()))
  const used = words.length ? words : all
  if (!used.length) return '?'
  const letters = (word: string, count: number) => Array.from(word).slice(0, count).join('')
  const initials = used.length > 1 ? letters(used[0], 1) + letters(used[used.length - 1], 1) : letters(used[0], 2)
  return initials.normalize('NFC').toUpperCase()
}
