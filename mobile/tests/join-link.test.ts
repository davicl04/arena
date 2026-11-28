import { describe, expect, it } from 'vitest'
import { joinTokenFromUrl } from '../src/utils/joinLink'

describe('link do time', () => {
  it.each([
    ['arena://entrar/AbC-123_xyz', 'AbC-123_xyz'],
    ['arena:///entrar/AbC-123_xyz', 'AbC-123_xyz'],
    ['arena://entrar/AbC-123_xyz/', 'AbC-123_xyz'],
    ['https://arena.example.com/entrar/AbC-123_xyz', 'AbC-123_xyz'],
    ['http://192.168.0.10:5173/entrar/AbC-123_xyz?utm=1', 'AbC-123_xyz'],
    ['https://arena.example.com/entrar/AbC-123_xyz#topo', 'AbC-123_xyz'],
    ['  arena://entrar/espaco  ', 'espaco'],
    // Expo Go (desenvolvimento): o caminho do app vem depois de `/--/`, com ou sem caminho do bundle antes.
    ['exp://192.168.0.1:8081/--/entrar/AbC-123_xyz', 'AbC-123_xyz'],
    ['exps://u.expo.dev/projeto/--/entrar/AbC-123_xyz?x=1', 'AbC-123_xyz'],
  ])('lê o token de %s', (url, token) => {
    expect(joinTokenFromUrl(url)).toBe(token)
  })

  it.each([
    null, undefined, '', 'arena://', 'arena://perfil/abc', 'arena://entrar/', 'arena://entrar/a b',
    'https://arena.example.com/', 'https://arena.example.com/entrar', 'https://arena.example.com/outra/entrar/abc',
    'ftp://arena.example.com/entrar/abc', 'exp://192.168.0.1:8081/entrar/abc', 'exp://192.168.0.1:8081/--/perfil/abc',
    'exp://192.168.0.1:8081/--/outra/entrar/abc', 'exp:///--/entrar/abc', `arena://entrar/${'a'.repeat(129)}`,
  ])('ignora %s', url => {
    expect(joinTokenFromUrl(url)).toBeNull()
  })
})
