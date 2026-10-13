# Decisões da fundação do Arena

Data: 9 de outubro de 2026, atualizado em 10 de outubro de 2026 com o [plano do perfil](../plano-perfil.md). Decisões técnicas adotadas na implementação da entrega 1; alterações de domínio continuam sujeitas à atualização das especificações.

## Identidade e perfis

Cadastro exige nome de 2 a 100 caracteres após remover espaços nas bordas, e-mail válido, data de nascimento e senha de 10 a 128 caracteres. O backend compara a data de nascimento com a data atual em `America/Sao_Paulo`; quem nasceu em 29 de fevereiro completa a idade em 1º de março nos anos não bissextos. A regra é testada com datas fixas. A declaração da data não constitui verificação documental da identidade.

O e-mail é validado e convertido para minúsculas antes de persistir ou autenticar. A unicidade no PostgreSQL protege também contra cadastros concorrentes. Não removemos pontos nem sufixos `+` do endereço. A edição da conta permite mudar o nome e o nome de usuário (@); e-mail e data de nascimento continuam imutáveis.

Cada conta tem um @ único, com 3 a 30 caracteres `[a-z0-9._]`, sem ponto no início, no fim ou repetido. O servidor remove o `@` inicial e converte para minúsculas antes de validar, e nomes reservados (como `admin`, `suporte` e `arena`) são recusados. A troca é livre, em `PATCH /api/v1/me`, e a disponibilidade é consultada em `GET /api/v1/me/username-availability`, que exige sessão para não permitir enumeração anônima. A consulta devolve o motivo do bloqueio (`invalid`, `reserved` ou `taken`) e até três sugestões. O cadastro gera o @ a partir do nome e repete a geração em caso de conflito concorrente. Contas existentes receberam um @ na migração `0004`: nome sem acentos, espaços trocados por pontos, nome curto com sufixo `.atleta`, nome vazio virando `atleta`, e colisões ou reservados recebendo um número. O @ é visível a membros autenticados, inclusive em conta privada.

Perfis são únicos por usuário e modalidade (`futebol`, `tenis`, `corrida`). Cada perfil tem cidade e status de procura; no futebol, posição preferida opcional (`goleiro`, `defesa`, `meio_campo`, `atacante`). A posição por atuação será um dado distinto quando partidas forem implementadas. Nível é devolvido como `null`, pois não existem resultados para classificá-lo. O cliente não pode enviar nível, titular ou visibilidade.

Os perfis esportivos permanecem privados, sem endpoints públicos. A visibilidade social é um campo separado da conta; alterar a privacidade social nunca publica cidade, modalidade, posição ou disponibilidade esportiva.

### Imagens privadas, avatar e capa

O avatar é armazenado em objeto privado S3 compatível. Em desenvolvimento o Compose constrói MinIO a partir do código da versão fixada, mantém volume próprio e expõe portas 9000/9001; o bucket `arena-media` é preparado por comando explícito. A API grava metadados e um vínculo nullable no usuário, cria uma chave aleatória e serve a imagem por rota autenticada. Não persiste URL presigned nem expõe credenciais aos clientes. Upload valida o conteúdo decodificado (JPEG, PNG ou WebP estático, 5 MiB e 25 megapixels), aplica orientação EXIF, remove metadados e normaliza para WebP quadrado de até 512 px. Produção ainda requer decisão de provedor, suporte, hospedagem, HTTPS e backup.

A foto de capa segue o mesmo modelo: objeto privado com prefixo `covers/`, vínculo `users.cover_media_id` e rotas `PUT`, `GET` e `DELETE /api/v1/me/cover`. Os formatos e limites são os do avatar (JPEG, PNG ou WebP estáticos, 5 MiB e 25 megapixels, EXIF descartado). O recorte é centralizado na proporção 5:2, sem ampliar, com no máximo 1500×600 px. A web recorta a capa em 5:2 no cliente antes do envio; o Expo usa o seletor nativo com `aspect: [5, 2]` (no iOS o recorte nativo é quadrado e o servidor centraliza em 5:2).

### Posts e privacidade social

Posts reutilizam `media_objects`, mas vinculam uma foto quadrada otimizada de até 1.080 px; o servidor exige arquivo estático JPEG, PNG ou WebP, valida pelo conteúdo, corrige EXIF e remove metadados. O bucket continua privado e imagens são servidas pela API com sessão e `Cache-Control: private, no-store`. A reconciliação verifica vínculos de avatares, capas e posts antes de excluir órfãos.

Contas começam com `social_public=false`; conta pública permite leitura por usuários autenticados. Uma conta privada só libera posts, comentários e listas autorizadas a si e aos seguidores aprovados. Nome, @, avatar e capa ficam visíveis a usuários autenticados, inclusive em perfil privado; e-mail, nascimento e perfis esportivos não são incluídos nos schemas sociais. As contagens de seguidores e seguindo também são sempre visíveis a membros autenticados, mesmo em conta privada não seguida. `post_count` continua zerado sem permissão, e as listas de seguidores, seguindo e posts seguem fechadas (404) para quem não pode vê-las. Seguidores em comum (`GET /api/v1/users/{id}/mutual-followers`) reúnem pessoas que o visitante segue e que também seguem o perfil, excluindo contas inativas e bloqueadas; no perfil próprio a lista é vazia. Bloqueios têm efeito nos dois sentidos, retiram relações e pedidos, e desbloqueio não recria vínculos. Mudanças de visibilidade são reavaliadas em cada rota e leitura de mídia.

Feed, galerias, comentários, listas de seguidores/seguindo, solicitações, bloqueios e fila de moderação usam cursor por data e ID, 20 itens por padrão e limite de 50, no envelope `{ items, next_cursor }`. Curtidas e vínculos têm constraints únicas; repetição de curtida/seguir/aprovar é idempotente. Comentários têm até 1.000 caracteres; legendas até 2.200. Sem respostas encadeadas ou lista nominal de curtidas nesta versão.

Denúncias referenciam post, comentário ou conta; decisões administrativas guardam administrador, alvo, ação, justificativa e data sem copiar conteúdo removido. Apenas contas promovidas pelo comando `python -m app.admin_cli promote-admin EMAIL` entram na área administrativa. Suspensão desativa a conta, revoga sessões e oculta seu conteúdo; só a fila pendente permite a um administrador visualizar conteúdo privado denunciado.

A fila administrativa acrescenta `target_user_id` e `target_user_active` quando a conta responsável ainda pode ser identificada. Esses campos permitem a reativação pela fila resolvida, sem devolver foto ou texto privado nessa fila. A reativação usa `PUT /api/v1/admin/users/{id}/status` com `active=true` e justificativa; mantém sessões anteriores revogadas. Denunciar uma conta exige acesso ao perfil básico, enquanto denúncias de posts e comentários exigem autorização para o conteúdo correspondente. Bloqueio e suspensão são reavaliados também nas rotas de avatar social e de comentário.

## Cidades

Usamos códigos de municípios do IBGE como identificadores estáveis. A migração inclui um catálogo inicial limitado: Brasília, São Paulo, Rio de Janeiro, Fortaleza, Belo Horizonte e Goiânia. Não são o catálogo nacional completo nem regiões administrativas do DF. A consulta é local ao banco, sem depender da rede do IBGE durante cadastro. Novos municípios podem entrar em migrações; uma importação nacional será uma evolução explícita.

Fonte: [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades).

## Autenticação e sessão

Senhas usam Argon2 por `pwdlib`, conforme a [documentação de segurança do FastAPI](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/). A sessão usa token opaco aleatório de 256 bits. Somente seu hash SHA-256 é persistido no banco; não usamos JWT nem uma chave global `SECRET_KEY`. O campo obsoleto foi removido do exemplo de configuração.

Sessões duram 24 horas por padrão, configuráveis em `SESSION_HOURS`; expiram no servidor e são removidas no logout. Não há renovação automática nesta etapa: após expirar, o usuário entra novamente. Requisições sem sessão e sessões expiradas não retornam dados privados.

Na web, login com `Origin` permitido grava cookie HttpOnly, SameSite=Lax, Secure fora do desenvolvimento. O token não é entregue ao JavaScript. Escritas por cookie exigem `Origin` permitido; login e cadastro aceitam apenas JSON e bloqueiam origens desconhecidas. No mobile, sem `Origin`, o login retorna token para Expo SecureStore e as chamadas usam Bearer. A configuração inicial de produção pressupõe web e API no mesmo site, com HTTPS; domínios de sites diferentes exigem revisão da política de cookie e CSRF.

As alterações de perfil usam o usuário da sessão, nunca um ID enviado pelo cliente. O PUT usa upsert PostgreSQL com restrição única, preservando um só perfil por modalidade em reenvios.

## Ferramentas e execução

Backend usa Python 3.13, FastAPI, SQLAlchemy e Alembic com driver explícito `psycopg2`. `requirements.txt` identifica dependências diretas e `requirements.lock.txt` fixa o ambiente instalado, incluindo testes e lint. Web usa React, TypeScript e Vite; desde 11 de outubro de 2026, também Tailwind CSS 4 e componentes shadcn/ui (preset `base-nova`, sobre Base UI) em `web/src/components/ui/`, a pedido do usuário.

**Estilo da web (desde a migração de 11 de outubro de 2026):**
- Todo o visual usa utilitários Tailwind. O antigo `styles.css` foi removido.
- `src/ui.css` é a única folha de estilo. Ela importa o Tailwind completo, com preflight, e reúne:
  - os tokens em `@theme`: cores `brand`, `ink`, `ink-muted`, `line`, `app`, `focus`, `danger` e outras; fontes `sans`/`display`; raios, sombras, camadas `--z-index-*` e animações;
  - a variante `app-narrow` (até 430 px);
  - a base ARENA em `@layer base`: tipografia do documento, foco laranja, campos e ajustes que neutralizam o preflight.
- Padrões repetidos são primitivos com `class-variance-authority` em `web/src/components/ui/`: Button/IconButton, Sheet (com `useDialogFocus`), Tabs, Glass, ListRow/PersonRow, Chip, Card, EmptyState e outros. As páginas não repetem classes longas.
- Os tokens do shadcn continuam em `--ui-*` e apontam para os tokens ARENA.
- Os componentes shadcn do preset não foram adotados para Button, Tabs e Sheet, porque não reduziriam código nem preservariam o foco atual.

**Estilo do mobile:**
- O mobile usa NativeWind 5.0.0-rc.0 (Tailwind 4.1.12, sobre `react-native-css` 3.1.0-rc.0). É uma versão candidata, autorizada pelo usuário.
- Exige `react-native-reanimated` e `react-native-worklets`, `metro.config.js` com `withNativewind`, `postcss.config.mjs` e `global.css`, importado em `App.tsx`. O `lightningcss` 1.30.1 é fixado por `overrides` em `@expo/metro-config`.
- Os tokens têm os mesmos nomes da web, em `mobile/global.css` (`@theme`) e `mobile/src/theme.ts` (valores usados em JS). Os dois arquivos devem permanecer sincronizados.
- Os valores preservam o visual anterior do app, por isso `ink`, `ink-muted`, `line` e `danger` diferem da web. `--spacing` é 4 px.
- Valores dinâmicos, como avatar, altura da capa e sombra de texto, ficam em `style`.

Mobile usa versões compatíveis com o template e SDK Expo 57. Dependências dos clientes são registradas com versões e `package-lock.json` para `npm ci`.

A web preserva a paleta do documento de iniciação e usa Sora/Inter com fallback de sistema. As fontes web vêm do Google Fonts; o mobile usa fontes de sistema nesta entrega. Cada cliente mantém seus componentes; os contratos são os mesmos, descritos pelo OpenAPI da API.

Docker Compose continua sendo o ambiente padrão do banco. Durante a validação local, o Docker Desktop apresentou erro no serviço de inferência. A verificação utilizou PostgreSQL 16.14 isolado em `.local/` na porta 55432, ligado somente a `127.0.0.1`. Esse ambiente auxiliar não é versionado e não modifica a configuração Docker do usuário.

## Pendências

Validação em aparelhos Android/iOS, políticas de recuperação de senha/verificação de e-mail e proteção contra abuso para publicação na internet não foram comprovadas nesta fundação. Hospedagem, backups e demais decisões de domínio permanecem pendentes conforme o documento de iniciação. O MVP completo não está concluído.
