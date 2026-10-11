import React, { useEffect, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Post, SocialComment } from '../src/api/client'
import PostImage from '../src/components/PostImage'
import PostItem, { postDate } from '../src/components/PostItem'
import { button, byLabel, click, enableAct, press, textOf, type } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } },
  apiUrl: (path: string) => path,
  request: vi.fn(),
}))

const author = { id: 2, name: 'Atleta A', username: 'atleta.a', avatar_url: null, cover_url: null, social_public: true, post_count: 1,
  follower_count: 0, following_count: 0, follows_you: false, follow_state: 'none' as const }
const basePost: Post = { id: 7, author, caption: 'Treino do dia', image_url: '/post.webp', created_at: '2026-10-10T10:00:00Z',
  like_count: 2, comment_count: 2, liked_by_me: false, can_edit: false }
const comment = (id: number, extra: Partial<SocialComment> = {}): SocialComment => ({ id, author_id: 2, author_name: 'Atleta A', author_avatar_url: null,
  body: `Comentário ${id}`, created_at: '2026-10-10T10:00:00Z', can_delete: false, ...extra })

type Tree = ReturnType<typeof create>
let latest: Post | null = null
function Harness({ initial, onExpired, onOpenProfile }: { initial: Post; onExpired: () => void; onOpenProfile?: (id: number) => void }) {
  const [post, setPost] = useState<Post | null>(initial)
  useEffect(() => { latest = post }, [post])
  return post ? React.createElement(PostItem, { post, viewerId: 1, token: 'token', onExpired, onOpenProfile,
    onUpdate: (id, change) => setPost(old => old && old.id === id ? change(old) : old), onRemove: () => setPost(null) }) : null
}
async function mount(extra: Partial<Post> = {}, onExpired = vi.fn(), onOpenProfile?: (id: number) => void) {
  let tree!: Tree
  await act(async () => { tree = create(React.createElement(Harness, { initial: { ...basePost, ...extra }, onExpired, onOpenProfile })) })
  return tree
}

describe('PostItem, PostActions, ReportForm e PostComments', () => {
  beforeEach(() => { enableAct(); latest = null; vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

  it('mostra autor, data e legenda; curte, descurte e abre o perfil do autor', async () => {
    const openProfile = vi.fn()
    const tree = await mount({}, vi.fn(), openProfile)
    expect(textOf(tree)).toContain('Treino do dia')
    await press(tree, 'Abrir perfil de @atleta.a')
    expect(openProfile).toHaveBeenCalledWith(2)
    await press(tree, 'Curtir, 2 curtidas')
    expect(request).toHaveBeenCalledWith('/posts/7/like', 'PUT')
    expect(latest).toMatchObject({ liked_by_me: true, like_count: 3 })
    await press(tree, 'Curtir, 3 curtidas')
    expect(request).toHaveBeenCalledWith('/posts/7/like', 'DELETE')
    expect(latest).toMatchObject({ liked_by_me: false, like_count: 2 })
    vi.mocked(request).mockRejectedValueOnce(new Error('Sem conexão.'))
    await press(tree, 'Curtir, 2 curtidas')
    expect(textOf(tree)).toContain('Sem conexão.')
    await act(async () => { tree.unmount() })
  })

  it('A5: etiqueta com @usuário sobre a foto 1:1 e a data curta no início da legenda', async () => {
    const tree = await mount({}, vi.fn(), vi.fn())
    const tag = byLabel(tree, 'Abrir perfil de @atleta.a')[0]
    const tagText = tag.findAllByType('Text' as never).map(node => node.props.children).flat()
    expect(tagText).toEqual(expect.arrayContaining(['@', 'atleta.a']))
    // O nome não aparece mais sobre a foto; só o @ (o avatar mostra as iniciais).
    expect(textOf(tree)).not.toContain('Atleta A')
    const media = tree.root.findAll(node => String(node.type) === 'View' && String(node.props.className).includes('aspect-square'))
    expect(media).toHaveLength(1)
    expect(tree.root.findAll(node => String(node.props.className ?? '').includes('aspect-[4/5]'))).toHaveLength(0)
    // A linha da legenda começa pela data (em cinza) e segue com o texto.
    const caption = tree.root.findAllByType('Text' as never).find(node => Array.isArray(node.props.children) && String(node.props.children[1]).includes('Treino do dia'))!
    expect(caption.findAllByType('Text' as never)[1].props.children).toBe('10 de out.')
    await act(async () => { tree.unmount() })
  })

  it('sem legenda mostra só a data; no visualizador sem onOpenProfile a etiqueta não é botão', async () => {
    const tree = await mount({ caption: '' })
    expect(textOf(tree)).toContain('10 de out.')
    expect(byLabel(tree, 'Abrir perfil de @atleta.a')).toHaveLength(0)
    expect(byLabel(tree, '@atleta.a')).toHaveLength(1)
    expect(postDate('2025-03-02T12:00:00Z', new Date('2026-10-11T12:00:00Z'))).toBe('2 de mar. de 2025')
    expect(postDate('2026-03-02T12:00:00Z', new Date('2026-10-11T12:00:00Z'))).toBe('2 de mar.')
    await act(async () => { tree.unmount() })
  })

  it('o dono edita a legenda com contador e envia o PATCH com o corpo correto', async () => {
    vi.mocked(request).mockImplementation(async (path, method, body) => (method === 'PATCH' ? { ...basePost, can_edit: true, caption: (body as { caption: string }).caption } : undefined) as never)
    const tree = await mount({ can_edit: true })
    await press(tree, 'Ações da publicação')
    expect(byLabel(tree, 'Denunciar publicação')).toHaveLength(0)
    await press(tree, 'Editar legenda')
    expect(textOf(tree)).toContain('13')
    expect(textOf(tree)).toContain('2200')
    expect(button(tree, 'Salvar')!.props.disabled).toBe(true)
    await type(tree, 'Legenda', 'Jogo de domingo')
    expect(byLabel(tree, '15 de 2200 caracteres')).toHaveLength(1)
    await click(tree, 'Salvar')
    expect(request).toHaveBeenCalledWith('/posts/7', 'PATCH', { caption: 'Jogo de domingo' })
    expect(latest?.caption).toBe('Jogo de domingo')
    expect(textOf(tree)).toContain('Jogo de domingo')
    expect(byLabel(tree, 'Legenda')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('o dono exclui com confirmação no vidro; Cancelar volta ao menu', async () => {
    const tree = await mount({ can_edit: true })
    await press(tree, 'Ações da publicação')
    await press(tree, 'Excluir publicação')
    expect(textOf(tree)).toContain('Excluir publicação?')
    await click(tree, 'Cancelar')
    expect(byLabel(tree, 'Editar legenda')).toHaveLength(1)
    await press(tree, 'Excluir publicação')
    vi.mocked(request).mockRejectedValueOnce(new ApiError('Sessão expirada', 401))
    await click(tree, 'Excluir')
    expect(textOf(tree)).toContain('Sessão expirada')
    await click(tree, 'Excluir')
    expect(request).toHaveBeenLastCalledWith('/posts/7', 'DELETE')
    expect(latest).toBeNull()
    await act(async () => { tree.unmount() })
  })

  it('o visitante denuncia o post; o envio fica desabilitado até escolher o motivo', async () => {
    const tree = await mount()
    await press(tree, 'Ações da publicação')
    expect(byLabel(tree, 'Editar legenda')).toHaveLength(0)
    await press(tree, 'Denunciar publicação')
    expect(button(tree, 'Enviar denúncia')!.props.disabled).toBe(true)
    await press(tree, 'Conteúdo inadequado')
    expect(byLabel(tree, 'Conteúdo inadequado')[0].props.accessibilityState.checked).toBe(true)
    expect(button(tree, 'Enviar denúncia')!.props.disabled).toBe(false)
    await type(tree, 'Detalhes (opcional)', ' foto ofensiva ')
    await click(tree, 'Enviar denúncia')
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'post', target_id: 7, reason: 'conteudo_inadequado', description: 'foto ofensiva' })
    expect(textOf(tree)).toContain('Denúncia enviada para análise.')
    await click(tree, 'Concluir')
    expect(byLabel(tree, 'Ações da publicação')[0].props.accessibilityState.expanded).toBe(false)
    await act(async () => { tree.unmount() })
  })

  it('mostra o erro da denúncia e trata a sessão expirada', async () => {
    const onExpired = vi.fn()
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada', 401))
    const tree = await mount({}, onExpired)
    await press(tree, 'Ações da publicação')
    await press(tree, 'Denunciar publicação')
    await press(tree, 'Spam')
    await click(tree, 'Enviar denúncia')
    expect(onExpired).toHaveBeenCalled()
    expect(textOf(tree)).toContain('Sessão expirada')
    await press(tree, 'Voltar')
    expect(byLabel(tree, 'Denunciar publicação')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('comenta, carrega mais, exclui e mantém comment_count sincronizado', async () => {
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts/7/comments' && method === 'POST') return comment(30, { author_id: 1, author_name: 'Eu', body: 'Boa!', can_delete: true }) as never
      if (path === '/posts/7/comments') return { items: [comment(21, { can_delete: true })], next_cursor: 'c2' } as never
      if (path === '/posts/7/comments?cursor=c2') return { items: [comment(20)], next_cursor: null } as never
      return undefined as never
    })
    const tree = await mount()
    await press(tree, 'Comentários, 2')
    expect(textOf(tree)).toContain('Comentário 21')
    await press(tree, 'Carregar mais comentários')
    expect(textOf(tree)).toContain('Comentário 20')
    expect(byLabel(tree, 'Carregar mais comentários')).toHaveLength(0)
    expect(byLabel(tree, 'Enviar comentário')[0].props.disabled).toBe(true)
    await type(tree, 'Escreva um comentário', 'Boa!')
    await press(tree, 'Enviar comentário')
    expect(request).toHaveBeenCalledWith('/posts/7/comments', 'POST', { body: 'Boa!' })
    expect(latest?.comment_count).toBe(3)
    expect(textOf(tree)).toContain('Comentários (3)')
    expect(byLabel(tree, 'Escreva um comentário')[0].props.value).toBe('')
    // O próprio comentário não tem bandeira; o de terceiros que pode ser excluído tem as duas ações.
    expect(byLabel(tree, 'Denunciar comentário de Eu')).toHaveLength(0)
    await press(tree, 'Excluir comentário de Eu')
    expect(request).toHaveBeenCalledWith('/comments/30', 'DELETE')
    expect(latest?.comment_count).toBe(2)
    expect(textOf(tree)).not.toContain('Boa!')
    await press(tree, 'Fechar comentários')
    expect(byLabel(tree, 'Escreva um comentário')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('denuncia um comentário de terceiros no próprio vidro, com voltar', async () => {
    vi.mocked(request).mockImplementation(async (path, method) => (path === '/posts/7/comments' && !method ? { items: [comment(21)], next_cursor: null } : { id: 1 }) as never)
    const tree = await mount()
    await press(tree, 'Comentários, 2')
    expect(byLabel(tree, 'Excluir comentário de Atleta A')).toHaveLength(0)
    await press(tree, 'Denunciar comentário de Atleta A')
    expect(textOf(tree)).toContain('Denunciar comentário')
    await press(tree, 'Voltar aos comentários')
    expect(byLabel(tree, 'Escreva um comentário')).toHaveLength(1)
    await press(tree, 'Denunciar comentário de Atleta A')
    await press(tree, 'Assédio')
    await type(tree, 'Detalhes (opcional)', 'xingamento')
    await click(tree, 'Enviar denúncia')
    expect(request).toHaveBeenCalledWith('/reports', 'POST', { target_type: 'comment', target_id: 21, reason: 'assedio', description: 'xingamento' })
    expect(textOf(tree)).toContain('Denúncia do comentário enviada.')
    await click(tree, 'Concluir')
    expect(byLabel(tree, 'Escreva um comentário')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('mostra erros dos comentários e permite tentar de novo', async () => {
    let fail = true
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (path === '/posts/7/comments' && !method) { if (fail) throw new Error('Comentários indisponíveis.'); return { items: [], next_cursor: null } as never }
      throw new Error('Não deu.')
    })
    const tree = await mount()
    await press(tree, 'Comentários, 2')
    expect(textOf(tree)).toContain('Comentários indisponíveis.')
    fail = false
    await press(tree, 'Tentar carregar os comentários novamente')
    expect(textOf(tree)).toContain('Nenhum comentário ainda. Escreva o primeiro.')
    await type(tree, 'Escreva um comentário', 'Oi')
    await press(tree, 'Enviar comentário')
    expect(textOf(tree)).toContain('Não deu.')
    expect(latest?.comment_count).toBe(2)
    // Abrir o menu fecha os comentários: só um vidro por vez.
    await press(tree, 'Ações da publicação')
    expect(byLabel(tree, 'Escreva um comentário')).toHaveLength(0)
    expect(byLabel(tree, 'Denunciar publicação')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('a foto usa o Bearer da sessão e cai num bloco neutro sem token ou após falha', async () => {
    const render = (token: string | null) => React.createElement(PostImage, { path: '/posts/7/image', token, label: 'Treino' })
    let tree!: Tree
    await act(async () => { tree = create(render(null)) })
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(0)
    expect(byLabel(tree, 'Treino')).toHaveLength(1)
    await act(async () => { tree.update(render('sessao')) })
    const image = tree.root.findByType('Image' as never)
    expect(image.props.source).toEqual({ uri: '/posts/7/image', headers: { Authorization: 'Bearer sessao' } })
    await act(async () => { image.props.onError() })
    expect(tree.root.findAllByType('Image' as never)).toHaveLength(0)
    expect(textOf(tree)).toContain('Imagem indisponível')
    await act(async () => { tree.unmount() })
  })
})
