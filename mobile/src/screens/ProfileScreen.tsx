import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, clearToken, getToken, request, sports } from '../api/client'
import type { City, Page, Profile, ProfileInput, SocialUser, Sport, User } from '../api/client'
import { Button, Field } from '../components/ui'
import { cx, tw } from '../styles'
import { Avatar, Cover } from '../components/media'
import ListRow from '../components/ListRow'
import ProfileTitle from '../components/ProfileTitle'
import Sheet from '../components/Sheet'
import UsernameForm from '../components/UsernameForm'
import SportCard from '../components/SportCard'
import ProfileGallery from '../components/ProfileGallery'
import { MatchesEmpty, ProfileTabs } from '../components/ProfileTabs'
import type { ProfileTab } from '../components/ProfileTabs'
import ProfileTopBar, { TopBarButton, useCondensedTopBar } from '../components/ProfileTopBar'
import { appVersion } from '../utils/appInfo'
import { connectionsText } from '../utils/profile'

type Which = 'requests' | 'blocks' | 'followers' | 'following'
type SheetName = 'edit' | 'avatar' | 'cover' | 'name' | 'username' | 'visibility' | 'blocked' | 'connections' | 'menu'
const MAX_IMAGE = 5 * 1024 * 1024
const COVER_HEIGHT = 120

function PersonRow({ person, token, children }: { person: SocialUser; token: string | null; children?: ReactNode }) {
  return <View className="my-1.5 flex-row flex-nowrap items-center gap-2.5">
    <Avatar path={person.avatar_url} name={person.name} token={token} size={40} />
    <View className="grow basis-0"><Text numberOfLines={1} className="font-semibold text-ink">{person.name}</Text><Text numberOfLines={1} className="text-[13px] text-ink-muted">@{person.username}</Text></View>
    {children}
  </View>
}

function SmallAction({ label, text, onPress, disabled }: { label: string; text: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className={cx('min-h-11 min-w-11 items-center justify-center rounded-control bg-brand-soft px-3', disabled && 'opacity-50')}><Text className="font-bold text-brand">{text}</Text></Pressable>
}

function VisibilityOption({ selected, title, facts, onPress }: { selected: boolean; title: string; facts: string[]; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={title} onPress={onPress}
    className={cx('my-1.5 rounded-lg border-2 p-3.5', selected ? 'border-brand bg-brand-soft' : 'border-line bg-white')}>
    <Text className="mb-1.5 font-bold text-ink">{title}</Text>
    {facts.map(fact => <Text key={fact} className="text-[13px] leading-[20px] text-ink-muted">• {fact}</Text>)}
  </Pressable>
}

export default function ProfileScreen({ user, onUser, onLogout, onExpired, onNewPhoto, menuSections }: { user: User; onUser: (user: User) => void; onLogout: () => void; onExpired: () => void; onNewPhoto?: () => void; menuSections?: (close: () => void) => ReactNode }) {
  const [contentTab, setContentTab] = useState<ProfileTab>('Fotos')
  const { condensed, onScroll } = useCondensedTopBar(COVER_HEIGHT)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const followAction = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [token, setToken] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [fromMenu, setFromMenu] = useState(false)
  const [tab, setTab] = useState<'followers' | 'following'>('followers')
  const [draftPublic, setDraftPublic] = useState(user.social_public)
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [requests, setRequests] = useState<SocialUser[]>([])
  const [blocks, setBlocks] = useState<SocialUser[]>([])
  const [followers, setFollowers] = useState<SocialUser[]>([])
  const [following, setFollowing] = useState<SocialUser[]>([])
  const [cursors, setCursors] = useState<Record<Which, string | null>>({ requests: null, blocks: null, followers: null, following: null })
  useEffect(() => {
    let alive = true
    Promise.all([request<Profile[]>('/me/sports-profiles'), request<City[]>('/cities'), request<Page<{ user: SocialUser }>>('/me/follow-requests'), request<Page<SocialUser>>('/me/blocks'), request<Page<{ user: SocialUser }>>(`/users/${user.id}/followers`), request<Page<{ user: SocialUser }>>(`/users/${user.id}/following`), request<SocialUser>(`/users/${user.id}`)]).then(([p, c, r, b, followersPage, followingPage, me]) => { if (alive) { setProfiles(p); setCities(c); setRequests(r.items.map(item => item.user)); setBlocks(b.items); setFollowers(followersPage.items.map(item => item.user)); setFollowing(followingPage.items.map(item => item.user)); setCounts({ followers: me.follower_count, following: me.following_count }); setCursors({ requests: r.next_cursor, blocks: b.next_cursor, followers: followersPage.next_cursor, following: followingPage.next_cursor }) } })
      .catch(err => { if (alive) { setError(err.message); if (err instanceof ApiError && err.status === 401) onExpired() } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])
  useEffect(() => { let alive = true; void getToken().then(value => { if (alive) setToken(value) }); return () => { alive = false } }, [])
  function fail(err: unknown) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Tente novamente.') }
  function startFollowAction() {
    if (busy || followAction.current) return false
    followAction.current = true
    setBusy(true); setError(''); setMessage('')
    return true
  }
  function resolveLocalRequest(id: number, approve: boolean) {
    setRequests(old => old.filter(person => person.id !== id))
    if (approve) setCounts(old => ({ ...old, followers: old.followers + 1 }))
  }
  async function finishFollowAction() {
    // Recarrega a primeira página e seu cursor: aprovações mudam a ordem e o tamanho das listas.
    const [pending, connections, summary] = await Promise.allSettled([
      request<Page<{ user: SocialUser }>>('/me/follow-requests'),
      request<Page<{ user: SocialUser }>>(`/users/${user.id}/followers`),
      request<SocialUser>(`/users/${user.id}`),
    ])
    if (pending.status === 'fulfilled') {
      setRequests(pending.value.items.map(item => item.user))
      setCursors(old => ({ ...old, requests: pending.value.next_cursor }))
    }
    if (connections.status === 'fulfilled') {
      setFollowers(connections.value.items.map(item => item.user))
      setCursors(old => ({ ...old, followers: connections.value.next_cursor }))
    }
    if (summary.status === 'fulfilled') setCounts({ followers: summary.value.follower_count, following: summary.value.following_count })
    const results = [pending, connections, summary]
    const failure = results.find(result => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 401)
      ?? results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') fail(failure.reason)
    followAction.current = false
    setBusy(false)
  }
  function open(next: SheetName | null) { setError(''); setMessage(''); if (next === null || next === 'menu') setFromMenu(false); setSheet(next) }
  // "Editar perfil" aberto pelo menu volta ao menu; aberto pelo selo do avatar apenas fecha.
  function editFromMenu() { open('edit'); setFromMenu(true) }
  async function save(sport: Sport, input: ProfileInput) {
    try { const p = await request<Profile>(`/me/sports-profiles/${sport}`, 'PUT', input); setProfiles(old => [...old.filter(v => v.sport !== sport), p]) }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); throw err }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await request('/auth/logout', 'POST'); await clearToken(); onLogout() }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  async function rename() {
    setBusy(true); setError(''); setMessage('')
    try { onUser(await request<User>('/me', 'PATCH', { name })); setMessage('Nome atualizado.'); setSheet('edit') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  // 'aspect' vale no Android; no iOS o recorte nativo é quadrado e o servidor centraliza o resultado em 5:2.
  async function pickImage(kind: 'avatar' | 'cover') {
    setError(''); setMessage('')
    let result: ImagePicker.ImagePickerResult
    try { result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: true, aspect: kind === 'cover' ? [5, 2] : [1, 1], quality: 0.85 }) }
    catch (err) { fail(err); return }
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > MAX_IMAGE) { setError('A imagem deve ter até 5 MiB.'); return }
    const form = new FormData()
    form.append('file', { uri: asset.uri, name: asset.fileName ?? `${kind}.jpg`, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob)
    setBusy(true)
    try { onUser(await request<User>(kind === 'cover' ? '/me/cover' : '/me/avatar', 'PUT', form)); setMessage(kind === 'cover' ? 'Foto de capa atualizada.' : 'Foto de perfil atualizada.') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  async function removeImage(kind: 'avatar' | 'cover') {
    setBusy(true); setError(''); setMessage('')
    try { await request<void>(kind === 'cover' ? '/me/cover' : '/me/avatar', 'DELETE'); onUser({ ...user, [kind]: null }); setMessage(kind === 'cover' ? 'Capa padrão restaurada.' : 'Foto de perfil removida.') }
    catch (err) { fail(err) } finally { setBusy(false) }
  }
  async function savePrivacy() {
    if (!startFollowAction()) return
    try {
      const value = await request<{ social_public: boolean }>('/me/privacy', 'PUT', { social_public: draftPublic })
      onUser({ ...user, social_public: value.social_public }); setDraftPublic(value.social_public)
      if (value.social_public) { setRequests([]); setCursors(old => ({ ...old, requests: null })) }
      setMessage(value.social_public ? 'Conta pública. As solicitações pendentes foram aprovadas.' : 'Conta privada. Quem já segue continua seguindo.')
    } catch (err) { fail(err) } finally { await finishFollowAction() }
  }
  async function resolveRequest(id: number, approve: boolean) {
    if (!startFollowAction()) return
    try {
      await request(`/me/follow-requests/${id}?approve=${approve}`, 'PUT')
      resolveLocalRequest(id, approve)
    } catch (err) { fail(err) } finally { await finishFollowAction() }
  }
  async function approveAll() {
    if (!startFollowAction()) return
    try {
      // Cada aprovação tira o item da fila; por isso a primeira página é consultada de novo até esvaziar.
      while (true) {
        const page: Page<{ user: SocialUser }> = await request<Page<{ user: SocialUser }>>('/me/follow-requests')
        if (!page.items.length) break
        for (const item of page.items) {
          await request(`/me/follow-requests/${item.user.id}?approve=true`, 'PUT')
          resolveLocalRequest(item.user.id, true)
        }
      }
      setMessage('Solicitações aprovadas.')
    } catch (err) { fail(err) } finally { await finishFollowAction() }
  }
  async function unblock(id: number) {
    try { await request<void>(`/users/${id}/block`, 'DELETE'); setBlocks(old => old.filter(person => person.id !== id)) }
    catch (err) { fail(err) }
  }
  async function removeFollower(id: number) {
    try { await request<void>(`/me/followers/${id}`, 'DELETE'); setFollowers(old => old.filter(item => item.id !== id)); setCounts(old => ({ ...old, followers: Math.max(0, old.followers - 1) })) }
    catch (err) { fail(err) }
  }
  async function unfollow(id: number) {
    try { await request<void>(`/users/${id}/follow`, 'DELETE'); setFollowing(old => old.filter(item => item.id !== id)); setCounts(old => ({ ...old, following: Math.max(0, old.following - 1) })) }
    catch (err) { fail(err) }
  }
  async function loadMore(which: Which) {
    const cursor = cursors[which]
    if (!cursor || busy) return
    setBusy(true); setError('')
    try {
      const path = which === 'requests' ? '/me/follow-requests' : which === 'blocks' ? '/me/blocks' : `/users/${user.id}/${which}`
      if (which === 'blocks') {
        const page = await request<Page<SocialUser>>(`${path}?cursor=${encodeURIComponent(cursor)}`)
        setBlocks(old => [...old, ...page.items]); setCursors(old => ({ ...old, blocks: page.next_cursor }))
      } else {
        const page = await request<Page<{ user: SocialUser }>>(`${path}?cursor=${encodeURIComponent(cursor)}`)
        const people = page.items.map(item => item.user)
        if (which === 'requests') setRequests(old => [...old, ...people])
        else if (which === 'followers') setFollowers(old => [...old, ...people])
        else setFollowing(old => [...old, ...people])
        setCursors(old => ({ ...old, [which]: page.next_cursor }))
      }
    } catch (err) { fail(err) } finally { setBusy(false) }
  }
  function more(which: Which, label: string) {
    return cursors[which] ? <Button secondary title={`Carregar mais ${label}`} disabled={busy} onPress={() => void loadMore(which)} /> : null
  }
  const feedback = <>{error ? <Text className={tw.error} accessibilityRole="alert">{error}</Text> : null}{message ? <Text className={tw.success} accessibilityLiveRegion="polite">{message}</Text> : null}</>
  const back = () => open('edit')
  const visibilityChanged = draftPublic !== user.social_public
  // A rolagem é própria da tela: a barra superior fica fixa por fora do ScrollView.
  return <View className="grow basis-0">
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerClassName="pb-12">
      <View className="bg-white">
        <Cover path={user.cover?.url ?? null} token={token} height={COVER_HEIGHT} />
        <View className="px-5.5 pb-5.5">
          <View className="-mt-9 w-20">
            <View className="rounded-[40px] border-[3px] border-white"><Avatar path={user.avatar?.url ?? null} name={user.name} token={token} size={74} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Editar perfil" onPress={() => open('edit')} className="absolute -right-1 bottom-0 size-8 items-center justify-center rounded-[16px] bg-brand"><Text className="text-white">⚙</Text></Pressable>
          </View>
          <View className="mt-2.5"><ProfileTitle name={user.name} username={user.username} /></View>
          <Text className="mb-2 text-ink-muted">{user.social_public ? 'Conta pública' : 'Conta privada'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Conexões: ${connectionsText(counts.followers, counts.following)}`} onPress={() => open('connections')} className="min-h-11 justify-center"><Text className="font-semibold text-ink">{connectionsText(counts.followers, counts.following)}</Text></Pressable>
        </View>
      </View>
      <View className={tw.content}>
        {!sheet ? <>{error ? <><Text className={tw.error} accessibilityRole="alert">{error}</Text><Button secondary title="Recarregar dados" onPress={() => { setError(''); setLoading(true); setAttempt(v => v + 1) }} /></> : null}{message ? <Text className={tw.success} accessibilityLiveRegion="polite">{message}</Text> : null}</> : null}
        <View className={tw.card}>
          <Text className={tw.heading}>Notificações</Text>
          {requests.length ? <>
            <Text className={tw.body}>Solicitações para seguir ({requests.length}{cursors.requests ? '+' : ''})</Text>
            {requests.map(person => <PersonRow key={person.id} person={person} token={token}><SmallAction label={`Aprovar ${person.name}`} text="✓" disabled={busy} onPress={() => void resolveRequest(person.id, true)} /><SmallAction label={`Recusar ${person.name}`} text="✕" disabled={busy} onPress={() => void resolveRequest(person.id, false)} /></PersonRow>)}
            {more('requests', 'solicitações')}
            <Button title={busy ? 'Aguarde…' : 'Aprovar todas'} disabled={busy} onPress={() => void approveAll()} />
          </> : <Text className={tw.body}>Nenhuma notificação por enquanto.</Text>}
        </View>
        <Text className={tw.heading}>Suas modalidades</Text>{loading ? <ActivityIndicator accessibilityLabel="Carregando modalidades" /> : sports.map(s => <SportCard key={s.value} sport={s.value} label={s.label} cities={cities} profile={profiles.find(p => p.sport === s.value)} onSave={save} />)}
        {!loading && !profiles.length && !error ? <Text className={tw.body}>Adicione sua primeira modalidade acima.</Text> : null}
      </View>
      <ProfileTabs value={contentTab} onChange={setContentTab} />
      <View accessibilityLabel={contentTab} className="min-h-[280px]">
        {contentTab === 'Fotos'
          ? <ProfileGallery own userId={user.id} ownerName={user.name} ownerUsername={user.username} viewerId={user.id} token={token} onNewPhoto={onNewPhoto} onExpired={onExpired} />
          : <MatchesEmpty />}
      </View>
    </ScrollView>
    <ProfileTopBar condensed={condensed} username={user.username} trailing={<TopBarButton label="Menu" glyph="☰" condensed={condensed} onPress={() => open('menu')} />} />

    {sheet === 'edit' ? <Sheet title="Editar perfil" onClose={() => open(null)} onBack={fromMenu ? () => open('menu') : undefined}>
      {feedback}
      <Text className={tw.eyebrow}>PERFIL</Text>
      <ListRow label="Foto" value={user.avatar ? 'Alterar' : 'Adicionar'} onPress={() => open('avatar')} />
      <ListRow label="Foto de capa" value={user.cover ? 'Personalizada' : 'Padrão'} onPress={() => open('cover')} />
      <ListRow label="Nome" value={user.name} onPress={() => { setName(user.name); open('name') }} />
      <ListRow label="Nome de usuário" value={`@${user.username}`} onPress={() => open('username')} />
      <ListRow label="E-mail" value={`${user.email} (somente leitura)`} />
      <Text className={cx(tw.eyebrow, 'mt-5')}>PRIVACIDADE</Text>
      <ListRow label="Visibilidade da conta" value={user.social_public ? 'Pública' : 'Privada'} onPress={() => { setDraftPublic(user.social_public); open('visibility') }} />
      <ListRow label="Contas bloqueadas" value={String(blocks.length) + (cursors.blocks ? '+' : '')} onPress={() => open('blocked')} />
    </Sheet> : null}
    {sheet === 'avatar' ? <Sheet title="Foto de perfil" onClose={() => open(null)} onBack={back}>
      {feedback}
      <View className="my-3 items-center"><Avatar path={user.avatar?.url ?? null} name={user.name} token={token} size={110} /></View>
      <Button title={user.avatar ? 'Trocar foto' : 'Adicionar foto'} disabled={busy} onPress={() => void pickImage('avatar')} />
      {user.avatar ? <Button secondary title="Remover foto" disabled={busy} onPress={() => void removeImage('avatar')} /> : null}
    </Sheet> : null}
    {sheet === 'cover' ? <Sheet title="Foto de capa" onClose={() => open(null)} onBack={back}>
      {feedback}
      <View className="my-3 overflow-hidden rounded-lg"><Cover path={user.cover?.url ?? null} token={token} /></View>
      <Text className={tw.body}>A capa é larga, na proporção 5:2. No iOS o recorte do seletor é quadrado e o servidor centraliza a imagem em 5:2.</Text>
      <Button title={user.cover ? 'Trocar capa' : 'Enviar capa'} disabled={busy} onPress={() => void pickImage('cover')} />
      {user.cover ? <Button secondary title="Voltar à capa padrão" disabled={busy} onPress={() => void removeImage('cover')} /> : null}
    </Sheet> : null}
    {sheet === 'name' ? <Sheet title="Nome" onClose={() => open(null)} onBack={back}>
      {feedback}
      <Field label="Nome completo" value={name} onChangeText={setName} editable={!busy} maxLength={100} />
      <Button title={busy ? 'Salvando…' : 'Salvar nome'} disabled={busy || !name.trim() || name.trim() === user.name} onPress={() => void rename()} />
    </Sheet> : null}
    {sheet === 'username' ? <Sheet title="Nome de usuário" onClose={() => open(null)} onBack={back}>
      <UsernameForm current={user.username} onExpired={onExpired} onSaved={saved => { onUser(saved); setMessage('Nome de usuário atualizado.'); setSheet('edit') }} />
    </Sheet> : null}
    {sheet === 'visibility' ? <Sheet title="Visibilidade da conta" onClose={() => open(null)} onBack={back}>
      {feedback}
      <View accessibilityRole="radiogroup">
        <VisibilityOption selected={draftPublic} title="Pública" facts={['Qualquer pessoa autenticada vê suas publicações', 'Seguir não exige aprovação', 'Nome, @, foto e capa são visíveis']} onPress={() => setDraftPublic(true)} />
        <VisibilityOption selected={!draftPublic} title="Privada" facts={['Só seguidores aprovados veem suas publicações', 'Seguir exige a sua aprovação', 'Nome, @, foto, capa e contagens continuam visíveis']} onPress={() => setDraftPublic(false)} />
      </View>
      {visibilityChanged ? <Text className={tw.body}>{draftPublic ? 'Ao tornar a conta pública, as solicitações pendentes serão aprovadas.' : 'Ao tornar a conta privada, quem já segue você continua seguindo.'}</Text> : null}
      <Button title={busy ? 'Salvando…' : 'Salvar visibilidade'} disabled={busy || !visibilityChanged} onPress={() => void savePrivacy()} />
    </Sheet> : null}
    {sheet === 'blocked' ? <Sheet title="Contas bloqueadas" onClose={() => open(null)} onBack={back}>
      {feedback}
      {blocks.length ? blocks.map(person => <PersonRow key={person.id} person={person} token={token}><Button secondary title="Desbloquear" onPress={() => void unblock(person.id)} /></PersonRow>) : <Text className={tw.body}>Nenhuma conta bloqueada.</Text>}
      {more('blocks', 'contas bloqueadas')}
    </Sheet> : null}
    {sheet === 'connections' ? <Sheet title="Conexões" onClose={() => open(null)}>
      {feedback}
      <View className={tw.row}>
        {(['followers', 'following'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} className={cx(tw.chip.base, tab === value ? tw.chip.selected : tw.chip.idle)}><Text className={tab === value ? 'text-[13px] text-white' : tw.chipText.idle}>{value === 'followers' ? `Seguidores (${counts.followers})` : `Seguindo (${counts.following})`}</Text></Pressable>)}
      </View>
      {tab === 'followers' ? <>
        {followers.length ? followers.map(person => <PersonRow key={person.id} person={person} token={token}><Button secondary title="Remover" disabled={busy} onPress={() => void removeFollower(person.id)} /></PersonRow>) : <Text className={tw.body}>Nenhum seguidor.</Text>}{more('followers', 'seguidores')}
      </> : <>
        {following.length ? following.map(person => <PersonRow key={person.id} person={person} token={token}><Button secondary title="Deixar de seguir" disabled={busy} onPress={() => void unfollow(person.id)} /></PersonRow>) : <Text className={tw.body}>Você ainda não segue ninguém.</Text>}{more('following', 'contas seguidas')}
      </>}
    </Sheet> : null}
    {sheet === 'menu' ? <Sheet title="Menu" onClose={() => open(null)}>
      {feedback}
      <Text className={tw.eyebrow}>CONTA</Text>
      <ListRow label="Editar perfil" onPress={editFromMenu} />
      <ListRow label="Minhas modalidades" onPress={() => open(null)} />
      {menuSections?.(() => open(null))}
      <Text className={cx(tw.eyebrow, 'mt-5')}>APP</Text>
      <ListRow label="Notificações" value="Em breve" />
      <ListRow label="Sobre o ARENA" value={`Versão ${appVersion}`} />
      <View className="mt-5"><ListRow tone="danger" label={busy ? 'Aguarde…' : 'Sair da conta'} disabled={busy} onPress={() => void logout()} /></View>
    </Sheet> : null}
  </View>
}
