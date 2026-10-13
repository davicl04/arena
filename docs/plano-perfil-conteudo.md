# Plano — conteúdo do perfil, visualizador de posts, denúncias e topo fixo (web + Expo)

> Estado: **implementado em 10 de outubro de 2026** (web e Expo), conforme o registro em [situação da fundação](situacao-fundacao.md). Partidas (P2) e Atividades em Notificações continuam fora desta entrega.
>
> **Nota de 12 de outubro de 2026:** a decisão Partidas (P2) foi substituída pela linha do tempo de [plano-perfil-partidas.md](plano-perfil-partidas.md).

## Contexto

A tela de perfil hoje tem abas Atividades/Fotos/Partidas com estados vazios. A aba Fotos é uma grade 3×N sem ação ao tocar e deixa espaços em branco. Editar legenda, excluir e denunciar usam `window.prompt`/`window.confirm` (web) e `Alert` (Expo). Ao rolar o perfil, o hambúrguer (e o voltar/••• do visitante) some, porque fica dentro de `.profile-cover`, no fluxo da rolagem.

Em sessão de protótipos de 10 de outubro de 2026 (artefato privado do usuário: https://claude.ai/artifact/6ugJVsngiz9WyEpZDWHWqP), o usuário fechou:

| Parte | Decisão |
| --- | --- |
| Abas | **Fotos \| Partidas** (A), com ícone e fixas abaixo do topo. Atividades sai do perfil (vai para Notificações, fora desta entrega). |
| Grade | 3 colunas de ponta a ponta. A aba tem altura mínima. No perfil próprio, a última linha é completada com o quadro "Nova foto". |
| Visualizador | Página "Publicações" com feed vertical que abre no post tocado. |
| Post (A3) | Foto 4:5 com autor e data sobrepostos, pílulas de curtir/comentar sobre a imagem e legenda abaixo. |
| Comentários (C4) | Vidro escuro sobre a foto, com envio por **ícone**. |
| Menu ••• (M3) | Vidro sobre a foto. Dono: editar legenda (contador /2200) e excluir com confirmação. Visitante: denunciar. |
| Denúncias | Post (M3), comentário (bandeira → formulário no vidro C4) e conta (••• da capa → vidro em tela cheia com Bloquear/Denunciar). Motivos: spam, assédio, conteúdo inadequado e outro, com detalhes opcionais (≤1000). |
| Partidas (P2) | Boletim por modalidade. **Só design registrado**: sem domínio no backend, a aba mostra estado vazio. **Substituído** pela linha do tempo de [plano-perfil-partidas.md](plano-perfil-partidas.md). |
| Topo | Barra fixa que condensa: botões em círculos de vidro sobre a capa e, depois da capa, fundo claro + @usuário. |

Escopo confirmado: **web e Expo**. Os fluxos novos também valem na **Comunidade**. Nenhuma mudança de backend é necessária, pois todos os endpoints existem em `backend/app/routers/social.py` (posts, PATCH/DELETE, likes, comentários com cursor, `/reports` com `description`, `/users/{id}/block`).

Observação: `Post` não tem modalidade, então o sobreposto do A3 mostra autor + data (o protótipo mostrava a modalidade).

---

## Parte A — Web (`web/`)

### A1. Camada social compartilhada (remove duplicação e prompts)
- **Novo `web/src/api/social.ts`**, que usa `request` de `src/api/client.ts`.
  - Funções: `setLike(postId, liked)`, `updateCaption(postId, caption)` (PATCH, JSON), `deletePost`, `createComment`, `deleteComment`, `sendReport({ target_type, target_id, reason, description? })`, `blockUser(userId)`.
  - Constantes: `REPORT_REASONS` (valor, rótulo pt-BR, descrição), `CAPTION_MAX = 2200`, `COMMENT_MAX = 1000`, `REPORT_DETAILS_MAX = 1000`.
- **Comentários:** reutilizar `usePagedList` (`web/src/hooks/usePagedList.ts`) com `/posts/${id}/comments` e manipular a lista por `setItems`. Não criar hook de paginação novo.
- **Foco de diálogo:** extrair do `BottomSheet.tsx` a lógica de foco, Esc e Tab-trap para `web/src/hooks/useDialogFocus.ts`. O `BottomSheet` e os vidros novos passam a usá-la.

### A2. Componentes novos/alterados (`web/src/components/`)
- **`ReportForm.tsx`**: rádios de `REPORT_REASONS`, textarea opcional e "Enviar denúncia", desabilitado até escolher o motivo. Serve para post, comentário e conta.
- **`GlassPanel.tsx`**: contêiner de vidro com `role="dialog"`, rótulo, botão fechar, Esc e devolução de foco.
  - Variante `media`: absoluta sobre a foto.
  - Variante `screen`: tela inteira do app, para a conta.
- **`PostComments.tsx` (C4)**:
  - Lista com "Carregar mais comentários" e excluir quando `can_delete`.
  - Bandeira quando `author_id !== viewerId`, que abre o `ReportForm` no próprio vidro, com voltar.
  - Campo de comentário (`maxLength` 1000) com botão-ícone `SendHorizontal` (`aria-label="Enviar comentário"`).
  - Mantém o `comment_count` do post sincronizado.
- **`PostActions.tsx` (M3)**:
  - Dono (`can_edit`): Editar legenda (textarea + contador /2200, Salvar/Cancelar) e Excluir (confirmação no vidro).
  - Visitante: Denunciar.
- **`PostItem.tsx` (A3)**:
  - Mídia 4:5 com topo sobreposto: `SocialPhoto`, nome (abre o perfil quando `onOpenProfile` existe), data `pt-BR` e botão •••.
  - Pílulas curtir (`aria-pressed`) e comentários (`aria-expanded`). Legenda abaixo.
  - Só um vidro aberto por vez: abrir o menu fecha os comentários e vice-versa.
- **`PostViewer.tsx`**: página sobreposta "Publicações".
  - Posicionada absoluta no `.arena-app`, como as sheets, mantendo a barra inferior visível.
  - Voltar + @usuário. Abre posicionada no post tocado (efeito de layout).
  - "Carregar mais publicações" com auto-carregamento por `IntersectionObserver` (protegido quando inexistente). Esc fecha e o foco volta ao quadro tocado.
  - Ao excluir o último post, fecha.
- **`ProfileGallery.tsx`** (substitui `PhotoGrid.tsx`):
  - Dono do `usePagedList('/users/${id}/posts')`, compartilhado com o `PostViewer`, para que curtidas, legendas e exclusões reflitam na grade.
  - Quadros como `<button>` com `aria-label`. Quadro "Nova foto" só no perfil próprio, que leva à Comunidade.
  - Estados de carregando, erro e vazio.
- **`AccountActions.tsx`**: `GlassPanel` `screen` com identidade, **Bloquear** (confirmação, depois `onBack`) e **Denunciar conta** (`ReportForm`).
- **`ProfileTabs.tsx`**: abas `['Fotos', 'Partidas']` com ícones `Grid3x3`/`CalendarDays`, mantendo a navegação por teclado.
- **`ProfileHeader.tsx`**:
  - `leading`/`trailing` saem da `.profile-cover` para uma **`.profile-topbar` sticky** antes da capa, que a sobrepõe com margem negativa.
  - Classe condensada via `IntersectionObserver` na capa (protegido): fundo claro, borda e @usuário centralizado.
  - A API de props do componente não muda.

### A3. Páginas
- **`web/src/pages/ProfilePage.tsx`**:
  - Aba padrão **Fotos**. Fotos → `ProfileGallery` (próprio).
  - Partidas → `EmptyState` ("Sua história em campo", com texto sobre disponibilidade futura).
  - Remove Atividades.
- **`web/src/pages/UserProfilePage.tsx`**:
  - Mesmas abas quando `canView`, com `ProfileGallery` de visitante.
  - O `<details>` do ••• e `block()`/`report()` com `confirm`/`prompt` são substituídos por `AccountActions`.
  - O estado de carregando/erro também usa a topbar.
- **`web/src/components/SocialCommunity.tsx`**:
  - O feed passa a renderizar `PostItem` (mesmo visual A3, com vidros C4/M3) e usa `api/social.ts`.
  - Removem-se `toggleComments`/`loadComments`/`commentCursors`/`prompt`/`confirm`.
  - `SocialPostCard.tsx` sai, mas `SocialPhoto` é preservado e movido para um arquivo próprio.
  - **Mudança visual na Comunidade:** o card atual dá lugar ao post A3.

### A4. CSS (`web/src/styles.css`, nova seção "Perfil: conteúdo e posts")
- **Topbar e abas:**
  - `.profile-topbar`: `position: sticky; top: 0`, botões em círculo de vidro e estado `.is-condensed`.
  - `.tabs` do perfil: sticky logo abaixo da topbar.
  - Remover as regras órfãs `.profile-cover-slot` e `.profile-cover .social-menu`.
- **Grade e painel:**
  - Grade de ponta a ponta com gap de 2px e `.add-tile`.
  - Painel da aba com altura mínima por unidades de contêiner (`.screen { container-type: size }` + `min-height: calc(100cqh - topbar - abas)`). Fallback: variável CSS via `ResizeObserver`, se a contenção afetar a rolagem.
- **Post, vidros e formulários:** visualizador, post A3, pílulas, vidros, `ReportForm` e confirmações, todos com os tokens existentes (`--green`, `--line`, `--app-bg`). Respeitar `prefers-reduced-motion`, manter foco visível e evitar overflow horizontal em 320px.

### A5. Testes (`web/tests/`, vitest + Testing Library, mock de `request` no padrão existente)
- **Atualizar:**
  - `ProfileTabs.test.tsx` (2 abas).
  - `social-regressions.test.tsx` (ProfilePage com Fotos padrão).
  - `user-profile.test.tsx` (bloquear/denunciar pelo vidro, sem `stubGlobal('confirm'|'prompt')`).
  - `social.test.tsx` (novos rótulos do `PostItem`).
- **Novos:**
  - `profile-gallery.test.tsx`: abre no post tocado; curtir/descurtir; comentar, excluir e carregar mais; editar legenda (PATCH com o corpo correto); excluir post (some da grade e fecha quando vazio).
  - `reports.test.tsx`: post, comentário e conta, com payload incluindo `description` e botão desabilitado sem motivo.
  - `profile-topbar.test.tsx`: condensação com `IntersectionObserver` mockado.
  - `social-api.test.ts`.

---

## Parte B — Expo (`mobile/`)

Restrições: sem biblioteca de ícones, sem `expo-blur` e sem navegação. Não adicionar dependências. Usar glifos Unicode como o app já faz (☰ ‹ ✕ ♥ ♡ ➤ ⚑) com `accessibilityLabel`. O vidro é uma `View` com `rgba(8,20,14,0.92)`.

### B1. Base compartilhada
- **`mobile/src/api/social.ts`**: espelha o web (mesmas funções, `REPORT_REASONS` e limites).
- **`mobile/src/hooks/usePagedList.ts`**: porta do hook web com o mesmo contrato.

### B2. Componentes (`mobile/src/components/`)
- **`PostImage`**: imagem autenticada com o mesmo padrão de header Bearer do `media.tsx`.
- **`GlassOverlay`**: vidro absoluto sobre a foto ou a tela.
- **Equivalentes RN do web:** `ReportForm` (linhas `Pressable` como rádio + `TextInput` de detalhes), `PostComments`, `PostActions` e `PostItem` (4:5).
- **`PostViewer`**: `Modal` em tela cheia com `FlatList`, `initialScrollIndex` + `onScrollToIndexFailed`, e carregamento por `onEndReached`.
- **`ProfileGallery`**: grade 3 colunas por linhas mapeadas, sem `FlatList` aninhada em `ScrollView`, com quadro "Nova foto" no perfil próprio.
- **`ProfileTabs`**: Fotos \| Partidas.
- **`ProfileTopBar`**: barra absoluta fora do `ScrollView`, condensada quando `scrollY` passa da capa, com @usuário.

### B3. Telas
- **`mobile/App.tsx`**: deixa de envolver o perfil em `ScrollView`. O `ProfileScreen` passa a ter a própria rolagem, necessária para a topbar fixa.
- **`mobile/src/screens/ProfileScreen.tsx`**:
  - ☰ vai para a `ProfileTopBar`, que fica fixa.
  - Abas Fotos/Partidas: galeria de `/users/{me}/posts` (hoje inexistente) e Partidas vazio.
  - As sheets atuais são mantidas.
- **`mobile/src/screens/CommunityScreen.tsx`**:
  - O feed usa `PostItem` e removem-se o `Alert` de denúncia/exclusão e o modal de legenda.
  - O modal de perfil visitado ganha topbar (‹ e •••, que abre `AccountActions` em vidro), abas e a grade `ProfileGallery`.
  - Isso corrige as lacunas atuais: `profilePosts` não era atualizado ao excluir/comentar, e `comment_count` não diminuía.

### B4. Testes (`mobile/tests/*.test.ts`, vitest + react-test-renderer)
- Atualizar `community.test.ts` e `profile-menu.test.ts`: novos rótulos e a ampliação do mock de `react-native` (`Modal`, `FlatList.scrollToIndex`, `useWindowDimensions`).
- Novos testes:
  - `usePagedList`
  - `api/social`
  - fluxos de `PostActions`/`ReportForm`/`PostComments`
  - galeria + viewer

---

## Parte C — Documentação e materiais
- **`docs/situacao-fundacao.md`**:
  - Nova entrada datada no topo: o que mudou (web e Expo), verificações realmente executadas, limitações e pendências.
  - Atualizar a tabela "Estado atual das áreas da interface": Perfil com Fotos/Partidas; Atividades → Notificações pendente; Partidas P2 aguardando domínio.
- **`docs/fidelidade-figma.md`**: seção "Revisão do conteúdo do perfil — 10 de outubro de 2026", com as decisões A/A3/C4/M3/P2, o topo condensado e o fato de que Partidas só tem estado vazio.
- **Protótipo**: copiar o HTML final para `artifacts/prototipos/perfil-conteudo.html` (não versionado) como referência.
- README e decisões técnicas não mudam (sem contrato ou comando novo).

## Fora desta entrega
Dados e componente de Partidas (P2), Atividades em Notificações, mudanças de backend, commit/push.

## Ordem de execução
1. Web: A1 → A2 → A3 (perfil próprio, visitante, Comunidade) → A4 → A5. Validar.
2. Expo: B1 → B2 → B3 → B4. Validar.
3. Documentação (C).

## Verificação
- **Web** (em `web/`):
  - `npm run lint`, `npm run build` e `npm run test:coverage` (pisos de `docs/qualidade-codigo.md`).
  - No navegador, com backend real (Postgres via Docker Compose + uvicorn + Vite), em 320, 390 e 1440px.
- **Perfil próprio** (web):
  - Rolar: o hambúrguer fica fixo e a barra condensa com @usuário; as abas grudam logo abaixo.
  - Grade sem buracos e sem overflow horizontal.
  - Abrir um post e confirmar que o feed começa nele e rola pelos demais.
  - Curtir, comentar, excluir comentário, editar legenda e excluir post. Confirmar a persistência **após recarregar**.
- **Visitante** (web):
  - Denunciar post, comentário (com detalhes) e conta.
  - Conferir as denúncias na moderação (conta admin) com motivo e descrição.
  - Bloquear: volta à tela anterior e a conta aparece em Contas bloqueadas.
- **Comunidade** (web): os mesmos fluxos no feed.
- **Expo** (em `mobile/`):
  - `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run export:android`. Sem dependências novas, então `expo install --check` só por garantia.
  - Registrar que o build não comprova funcionamento em aparelho, salvo se houver teste em Expo Go.
- **Backend**: sem alterações; os testes de backend não são necessários para esta entrega.
