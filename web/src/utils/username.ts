/** Mesma regra do servidor; usada apenas para feedback ao vivo. */
export const USERNAME_PATTERN = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{3,30}$/

export function usernameRules(value: string) {
  return [
    { label: 'De 3 a 30 caracteres', ok: value.length >= 3 && value.length <= 30 },
    { label: 'Apenas letras minúsculas, números, ponto e sublinhado', ok: /^[a-z0-9._]+$/.test(value) },
    { label: 'Sem ponto no início, no fim ou repetido', ok: !value.startsWith('.') && !value.endsWith('.') && !value.includes('..') },
  ]
}

