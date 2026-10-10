# Decisões da fundação do Arena

Data: 9 de outubro de 2026. Decisões técnicas adotadas na implementação da entrega 1; alterações de domínio continuam sujeitas à atualização das especificações.

## Identidade e perfis

Cadastro exige nome de 2 a 100 caracteres após remover espaços nas bordas, e-mail válido, data de nascimento e senha de 10 a 128 caracteres. O backend compara a data de nascimento com a data atual em `America/Sao_Paulo`; quem nasceu em 29 de fevereiro completa a idade em 1º de março nos anos não bissextos. A regra é testada com datas fixas. A declaração da data não constitui verificação documental da identidade.

O e-mail é validado e convertido para minúsculas antes de persistir ou autenticar. A unicidade no PostgreSQL protege também contra cadastros concorrentes. Não removemos pontos nem sufixos `+` do endereço. A edição inicial da conta permite somente mudar o nome; e-mail e data de nascimento são imutáveis nesta etapa.

Perfis são únicos por usuário e modalidade (`futebol`, `tenis`, `corrida`). Cada perfil tem cidade e status de procura; no futebol, posição preferida opcional (`goleiro`, `defesa`, `meio_campo`, `atacante`). A posição por atuação será um dado distinto quando partidas forem implementadas. Nível é devolvido como `null`, pois não existem resultados para classificá-lo. O cliente não pode enviar nível, titular ou visibilidade.

Os perfis esportivos permanecem privados, sem endpoints públicos. A visibilidade social é um campo separado da conta; alterar a privacidade social nunca publica cidade, modalidade, posição ou disponibilidade esportiva.

### Imagens privadas e avatar

O avatar é armazenado em objeto privado S3 compatível. Em desenvolvimento o Compose constrói MinIO a partir do código da versão fixada, mantém volume próprio e expõe portas 9000/9001; o bucket `arena-media` é preparado por comando explícito. A API grava metadados e um vínculo nullable no usuário, cria uma chave aleatória e serve a imagem por rota autenticada. Não persiste URL presigned nem expõe credenciais aos clientes. Upload valida o conteúdo decodificado (JPEG, PNG ou WebP estático, 5 MiB e 25 megapixels), aplica orientação EXIF, remove metadados e normaliza para WebP quadrado de até 512 px. Produção ainda requer decisão de provedor, suporte, hospedagem, HTTPS e backup.

### Posts e privacidade social

Posts reutilizam `media_objects`, mas vinculam uma foto quadrada otimizada de até 1.080 px; o servidor exige arquivo estático JPEG, PNG ou WebP, valida pelo conteúdo, corrige EXIF e remove metadados. O bucket continua privado e imagens são servidas pela API com sessão e `Cache-Control: private, no-store`. A reconciliação verifica vínculos tanto de avatares quanto de posts antes de excluir órfãos.

Contas começam com `social_public=false`; conta pública permite leitura por usuários autenticados. Uma conta privada só libera posts, comentários e listas autorizadas a si e aos seguidores aprovados. Nome e avatar social ficam visíveis a usuários autenticados, inclusive em perfil privado; e-mail, nascimento e perfis esportivos não são incluídos nos schemas sociais. Bloqueios têm efeito nos dois sentidos, retiram relações e pedidos, e desbloqueio não recria vínculos. Mudanças de visibilidade são reavaliadas em cada rota e leitura de mídia.

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

Backend usa Python 3.13, FastAPI, SQLAlchemy e Alembic com driver explícito `psycopg2`. `requirements.txt` identifica dependências diretas e `requirements.lock.txt` fixa o ambiente instalado, incluindo testes e lint. Web usa React, TypeScript e Vite; mobile usa versões compatíveis com o template e SDK Expo 57. Dependências dos clientes são registradas com versões e `package-lock.json` para `npm ci`.

A web preserva a paleta do documento de iniciação e usa Sora/Inter com fallback de sistema. As fontes web vêm do Google Fonts; o mobile usa fontes de sistema nesta entrega. Cada cliente mantém seus componentes; os contratos são os mesmos, descritos pelo OpenAPI da API.

Docker Compose continua sendo o ambiente padrão do banco. Durante a validação local, o Docker Desktop apresentou erro no serviço de inferência. A verificação utilizou PostgreSQL 16.14 isolado em `.local/` na porta 55432, ligado somente a `127.0.0.1`. Esse ambiente auxiliar não é versionado e não modifica a configuração Docker do usuário.

## Pendências

Validação em aparelhos Android/iOS, políticas de recuperação de senha/verificação de e-mail e proteção contra abuso para publicação na internet não foram comprovadas nesta fundação. Hospedagem, backups e demais decisões de domínio permanecem pendentes conforme o documento de iniciação. O MVP completo não está concluído.
