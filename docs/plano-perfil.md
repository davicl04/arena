# Perfil, edição de perfil e perfil de visitante no ARENA

Data: 10 de outubro de 2026. Especificação definida com o usuário a partir de oito rodadas de protótipos interativos. Implementada em 10 de outubro de 2026; verificações e pendências estão em [situação da fundação](situacao-fundacao.md).

Atualização: o cabeçalho do perfil e a tela aberta pela engrenagem foram refinados em [plano do cabeçalho e do menu](plano-perfil-menu.md). O título passou a ser o @, o lápis virou pessoa com engrenagem e a engrenagem virou o hambúrguer do Menu. O item 4 e as menções a `app-settings`, `AppSettingsPage`, ao lápis e à engrenagem abaixo descrevem a entrega anterior.

## Contexto

O perfil atual concentra tudo na tela de configurações. O botão "Editar perfil" e a engrenagem levam ao mesmo lugar (`go("settings")`), o e-mail aparece no perfil e só o nome é editável. A capa é uma imagem fixa (`/images/arena-cover.jpg`). Não existe tela de perfil de outra pessoa, apenas um painel inline na Comunidade.

O protótipo de referência fica em `prototypes/editar-perfil.html`, que não é versionado. Ele é material de consulta: os textos e dados de exemplo não fazem parte do produto.

## Comportamento definido

1. **Edição em lista agrupada**, com dois grupos:
   - *Perfil*: Foto, Foto de capa, Nome, Nome de usuário e E-mail (somente leitura).
   - *Privacidade*: Visibilidade da conta e Contas bloqueadas.

   Cada item é editado numa **folha inferior**.
2. **Nome de usuário (@)**, uma novidade:
   - Formato: de 3 a 30 caracteres `[a-z0-9._]`, sem ponto no início, no fim ou repetido.
   - É único e fica visível mesmo com a conta privada.
   - A troca é livre e verifica a disponibilidade, com sugestões.
   - Contas existentes e novos cadastros recebem um @ gerado automaticamente a partir do nome.
3. **Foto de capa** personalizável. É um item na lista que abre uma folha com prévia, com as opções de enviar, trocar ou voltar à capa padrão. O recorte é largo, na proporção 5:2.
4. **Perfil próprio**:
   - Entrada da edição: um lápis no avatar.
   - A engrenagem passa a abrir as configurações do app, onde fica "Sair da conta".
   - O e-mail não aparece mais.
   - Mostra a linha "N seguidores · N seguindo".
   - As contagens ficam **sempre visíveis**. Para quem não segue uma conta privada, as listas continuam fechadas.
5. **Perfil de visitante**:
   - Botões Seguir, Solicitar ou Cancelar.
   - Bloquear e Denunciar.
   - **Seguidores em comum**: "X, Y e mais N que você segue também seguem esta conta".
6. **Visibilidade da conta**:
   - Duas opções lado a lado, com a lista do que fica visível em cada modo.
   - Avisos antes de salvar: as solicitações pendentes são aprovadas ao tornar a conta pública, e quem já segue continua seguindo ao torná-la privada.
7. **Listas de pessoas** em linhas compactas, com ações rápidas:
   - Contas bloqueadas: Desbloquear.
   - Conexões: Remover ou Deixar de seguir.
8. **Solicitações para seguir** saem da edição e vão, provisoriamente, para a tela **Notificações**, com ✓/✕ e "Aprovar todas". A melhoria definitiva fica para a revisão de outra tela.

Escopo: backend e web completos. O mobile implementa o mesmo fluxo em React Native, sem garantir paridade visual exata.

## Fase 1 — Backend

### Esquema

Migração `backend/migrations/versions/0004_profile_identity.py`, com `down_revision = '0003'`:

- **`users.username`** `String(30)`:
  1. Adicionar a coluna como nullable.
  2. Fazer o **backfill em Python** a partir de um slug do nome: remover acentos com `unicodedata` NFD, passar para minúsculas, trocar espaços por `.`, remover caracteres inválidos, limitar a 30 caracteres e completar até o mínimo de 3. Colisões recebem sufixo numérico.
  3. Tornar `NOT NULL` e `UNIQUE` (`uq_users_username`).

  A aplicação sempre grava em minúsculas, então uma unicidade simples basta. Isso evita índice de expressão e problemas com `alembic check` e com o schema isolado dos testes.
- **`users.cover_media_id`** `Uuid`, FK para `media_objects` com `ON DELETE SET NULL` (`fk_users_cover_media_id_media_objects`). Deve seguir o modelo de `0002_private_media.py`.
- **Modelo** em `backend/app/models/identity.py`:
  - `username` com `unique=True`.
  - `cover_media_id` e `cover_media = relationship(foreign_keys=[cover_media_id])`.
  - Propriedade `cover` equivalente a `avatar`, com URL `/api/v1/me/cover?v=`.

### Serviços

**`backend/app/services/identity.py`:**
- `USERNAME_RE`, `normalize_username()` e `RESERVED_USERNAMES` (admin, suporte, arena, api, me…).
- `username_candidates(name)` e `generate_username(db, name)`.
- `register_user` passa a gerar o @ e repete a tentativa em caso de `IntegrityError` por concorrência.

**`backend/app/services/media.py`:**
- `normalize_cover(raw)`:
  - Mesmas validações de `normalize_avatar`: formatos, 25 MP, animação e EXIF.
  - Recorte centralizado em 5:2, no máximo 1500×600, sem ampliar, em WebP com qualidade 85.
- Generalizar `store_avatar` em `store_user_image(db, user, normalized, kind)`. O `kind` define o atributo e o prefixo (`avatars/` ou `covers/`). `store_avatar` permanece como wrapper.
- `reconcile_orphans`: incluir `User.cover_media_id` entre os vínculos e o prefixo `covers/`, para não apagar metadados de capas em uso.

### Schemas e rotas

**Schemas:**
- `schemas/identity.py`:
  - `UserOut` ganha `username` e `cover: AvatarOut | None`.
  - `UpdateUser` passa a ter `name` e `username` opcionais, exigindo ao menos um, com validação de formato e normalização.
  - Novo `UsernameAvailabilityOut {available, reason, suggestions}`.
- `schemas/social.py`: `SocialUserOut` ganha `username` e `cover_url`.

**`routers/identity.py`:**
- `PATCH /me` aceita `username`. Um `IntegrityError` vira 409 com "Este nome de usuário já está em uso.".
- `GET /me/username-availability?u=` exige autenticação, para evitar enumeração anônima.
- `PUT/GET/DELETE /me/cover` seguindo as rotas de avatar.

**`routers/social.py`:**
- `_social_user`:
  - Sempre retorna as contagens de seguidores e seguindo.
  - `post_count` continua oculto sem `_can_view`.
  - Inclui `username` e `cover_url` (`/api/v1/users/{id}/cover?v=`).
- `GET /users/{id}/cover?v=` segue o modelo de `/users/{id}/avatar`: não exige `_can_view`, mas respeita bloqueio e conta ativa.
- `GET /users/{id}/mutual-followers?cursor=&limit=` retorna `{items: SocialUserOut[], total, next_cursor}`.
  - A consulta junta os follows aprovados de quem visita para X com os de X para o dono do perfil.
  - Filtra inativos e bloqueados e reutiliza `_page`.
- `GET /users?q=` também busca por `username`, com `ilike`.

**`backend/app/main.py`:** incluir `('PUT', '/api/v1/me/cover')` em `AvatarBodyLimitMiddleware.upload_paths` e na regra de upload de `origin_protection`.

### Testes do backend

**Unitários:**
- `test_identity.py`: regex, normalização, candidatos e reservados.
- `test_validation.py`: `UpdateUser` com `username`.
- `test_media.py`: `normalize_cover`, `store_user_image` e reconcile com capas, ajustando a ordem dos mocks.
- `test_social.py`: substituir `test_social_profile_hides_private_counts` por um teste com contagens visíveis e `post_count` oculto.

**Integração:**
- Novo `test_profile_identity.py`:
  - @ gerado no cadastro e no backfill.
  - `PATCH` com @ válido, inválido, duplicado e com maiúsculas.
  - Concorrência no modelo de `test_account_flow.py`.
  - Disponibilidade.
- Novo `test_cover_flow.py`, espelhando `test_avatar_flow.py` com `FakeStorage`.
- Seguidores em comum e contagens em `test_social_flow.py`.
- Ajustar as criações diretas de `User(...)` em `test_social_regressions.py` e em `backend/app/seed.py`.

## Fase 2 — Web: infraestrutura

- **`web/src/api/client.ts`:** `User` ganha `username` e `cover`; `SocialUser` ganha `username` e `cover_url`; novo tipo para a página de seguidores em comum.
- **Navegação** (`web/src/data/arena.ts`, `ArenaPage.tsx`):
  - Substituir `settings` por `edit-profile`, `app-settings`, `blocked`, `connections` e `user-profile`.
  - Novos estados `viewedUserId` e `connectionsTab`.
  - Voltar de `edit-profile`, `blocked` e `connections` leva à tela anterior correta. Hoje `page-topbar` sempre volta ao início.
  - Atualizar `activeNav`.
- **Recorte:** criar `web/src/utils/cropImage.ts`, com proporção configurável, substituindo `cropImage` (`AvatarEditor.tsx`) e `cropSquare` (`SocialCommunity.tsx`).
- **Componentes novos** em `web/src/components/`:
  - `BottomSheet.tsx`: `role="dialog"`, `aria-modal`, foco preso, fecha com Esc ou toque no fundo. Fica posicionado dentro de `.arena-app`, não fixo na viewport.
  - `ImageCropSheet.tsx`: generaliza o diálogo de recorte de `AvatarEditor`, redondo 1:1 ou retangular 5:2.
  - `PersonRow.tsx`: linha compacta com foto (via `SocialPhoto`), nome, @, informação extra e ações.
  - `ProfileHeader.tsx`, nos modos próprio e visitante, com:
    - capa própria ou padrão, avatar, nome e @
    - linha de conexões e seguidores em comum
    - chips das modalidades e privacidade
- **CSS** em `web/src/styles.css`, reaproveitando os tokens e as classes existentes. Novas classes para a folha, a lista agrupada, as opções de visibilidade e as linhas compactas.

## Fase 3 — Web: telas

- **`ProfilePage.tsx`:**
  - Usa `ProfileHeader` e remove o e-mail e o botão "Editar perfil".
  - O lápis no avatar abre `edit-profile`; a engrenagem abre `app-settings`.
  - As contagens vêm de `GET /users/{id}`.
- **`EditProfilePage.tsx`** (nova): cartão de identidade e os dois grupos. Cada item abre uma folha:
  - `NameSheet`: `PATCH /me {name}`.
  - `UsernameSheet`: verificação de disponibilidade com debounce, regras exibidas ao vivo, sugestões, `PATCH /me {username}` e aviso de visibilidade.
  - `AvatarSheet`: reaproveita a lógica de `AvatarEditor` com recorte redondo.
  - `CoverSheet`: prévia, enviar ou trocar, voltar ao padrão; `PUT/DELETE /me/cover` com recorte 5:2.
  - `VisibilitySheet`: duas opções, lista de fatos e avisos; `PUT /me/privacy`. Substitui o `window.confirm` atual.
- **`BlockedAccountsPage.tsx`:** `GET /me/blocks` paginado, com `PersonRow` e Desbloquear.
- **`ConnectionsPage.tsx`:**
  - Abas Seguidores e Seguindo (`/users/{id}/followers|following`).
  - No perfil próprio: Remover e Deixar de seguir. Para visitante: só leitura.
  - Modo "em comum" com `/mutual-followers`.
- **`UserProfilePage.tsx`** (visitante):
  - `ProfileHeader` no modo visitante, com Seguir, Solicitar ou Cancelar.
  - Menu com Bloquear e Denunciar, trazidos de `SocialCommunity`.
  - Em conta privada, tocar nas contagens mostra um aviso e o conteúdo fica bloqueado.
- **`AppSettingsPage.tsx`:** Notificações ("Em breve"), Sobre o ARENA (versão), Sair da conta e `AdminReports` para administradores. "Termos" fica de fora por não haver conteúdo real.
- **Notificações:** a tela passa a listar as solicitações para seguir, com `GET /me/follow-requests`, `PUT …?approve=` e "Aprovar todas". O estado vazio atual se mantém quando não há pedidos.
- **`SocialCommunity.tsx`:** abrir um autor ou uma pessoa navega para `user-profile`, e o painel inline `social-profile-panel` é removido. `SocialSettings.tsx` é desmembrado e removido.
- **Testes** em `web/tests/`:
  - Atualizar `avatar.test.tsx`, `social.test.tsx` e `social-regressions.test.tsx` para os rótulos e fluxos que mudaram de lugar.
  - Novos testes:
    - `UsernameSheet`: regras, debounce e 409.
    - `VisibilitySheet` e `CoverSheet`.
    - `BottomSheet`: foco e Esc.
    - `UserProfilePage`: contagens, seguidores em comum e seguir.
    - `ConnectionsPage` e a navegação de `ArenaPage`.

## Fase 4 — Mobile

- **`mobile/src/api/client.ts`:** os mesmos campos novos nos tipos, mantendo a cobertura exigida do transporte.
- **`ProfileScreen.tsx`** reorganizado em perfil próprio e edição em lista:
  - Perfil próprio com capa, avatar com lápis, @ e contagens.
  - Folhas com `Modal` (`animationType="slide"`).
  - @ com verificação de disponibilidade.
  - Capa via `expo-image-picker` com `aspect: [5, 2]`. No iOS o recorte nativo é quadrado, e o servidor centraliza em 5:2.
  - Visibilidade em duas opções e contas bloqueadas.
  - Solicitações numa seção de notificações.
- **`CommunityScreen.tsx`:** perfil visitado com capa, @, contagens sempre visíveis e seguidores em comum. Corrigir o rótulo fixo "Perfil privado" em `ProfileScreen.tsx`.
- **`App.tsx`:** acesso às configurações do app (Sair), se necessário.
- **Testes:** `tests/client.test.ts` e `tests/community.test.ts`, incluindo os literais de `User` com os campos novos.

## Fase 5 — Documentação

- `docs/decisoes/0001-fundacao.md`:
  - Identidade: nome **e @** editáveis, regras do @ e geração automática.
  - Imagens: capa 5:2 e seus limites.
  - Privacidade: contagens sempre visíveis; @ e capa visíveis para autenticados.
- Registrar as mudanças em `docs/plano-posts.md` (perfis privados) e em `docs/plano-minio-imagens.md`, onde a capa estava fora de escopo.
- Atualizar `docs/diagramas/fundacao.md` (ER com `username` e `cover_media_id`) e o `README.md` (limites da capa e reconcile).
- Adicionar em `docs/situacao-fundacao.md` uma entrada com as verificações executadas e as pendências.

## Arquivos críticos

**Backend:**
- `backend/app/models/identity.py`
- `backend/app/services/identity.py` e `backend/app/services/media.py`
- `backend/app/routers/identity.py` e `backend/app/routers/social.py`
- `backend/app/schemas/identity.py` e `backend/app/schemas/social.py`
- `backend/app/main.py`
- `backend/migrations/versions/0004_profile_identity.py`

**Web:**
- `web/src/pages/ArenaPage.tsx` e `web/src/pages/ProfilePage.tsx`
- `web/src/components/AvatarEditor.tsx`, `SocialCommunity.tsx` e `SocialSettings.tsx`
- `web/src/api/client.ts`
- `web/src/styles.css`

**Mobile:**
- `mobile/src/screens/ProfileScreen.tsx` e `mobile/src/screens/CommunityScreen.tsx`
- `mobile/src/api/client.ts`

## Verificação

**Backend** (em `backend/`, com `TEST_DATABASE_URL` e o MinIO ativo):
1. `.venv/Scripts/python.exe -m ruff check app migrations tests`.
2. `alembic upgrade head` no banco de desenvolvimento, sem apagar dados ou volumes. Conferir os @ gerados para as contas existentes.
3. `alembic check`.
4. `pytest -q --cov=app --cov-branch`, com pisos de 60% nos testes unitários e 85% no total.

**Web** (em `web/`):
- `npm run lint`, `npm run build` e `npm run test:coverage`.
- No navegador, em 320, 390 e 1440 px:
  - nome e @: disponível, em uso e inválido
  - foto e capa: recorte, troca e retorno ao padrão
  - visibilidade, com os avisos e a aprovação automática
  - contas bloqueadas e conexões
  - perfil de visitante com seguidores em comum e conta privada
  - solicitações em Notificações e Sair pela engrenagem
  - persistência após recarregar, ausência de overflow horizontal, teclado e foco nas folhas

**Mobile** (em `mobile/`):
- `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run export:android`.
- O build não comprova o funcionamento em aparelho.

## Ordem de entrega

1. Backend e documentação das decisões.
2. Web.
3. Mobile.
4. Situação final.

Os campos novos da API são aditivos e mantêm os clientes atuais funcionando, o que permite entregar por partes. Cada fase termina com sua própria validação.
