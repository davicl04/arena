# Arena

Plataforma web e mobile para futebol, tênis e corrida amadores. A fundação implementa cadastro de adultos, autenticação e perfis esportivos privados com PostgreSQL. A etapa 1 de Times e campeonatos acrescentou, no backend e na web, Meus times (convites, link do time, papéis e encerramento), o pedido de organizador com a fila da administração, as notificações da conta e a linha do elo na placa do Jogar, ainda sem partidas. A etapa 2 acrescentou, no backend e na web, os eventos: o organizador cria campeonatos e provas (rascunho, checklist, publicação direta do gratuito e aprovação da administração para o pago), gerencia inscrições, comprovantes de Pix, avisos, cancelamento com devolução e a revogação do organizador, e o atleta lista os eventos, se inscreve (com reserva, Pix e comprovante nos pagos) e responde à devolução. A etapa 3 acrescentou o Jogar no backend e na web: a placa busca adversário de verdade (times e tênis, e o avulso por posição), mostra a proposta e a oferta de vaga em tela cheia, e leva à tela da partida (condições com quadra, reserva, chat, cancelamento e W.O.) e ao cartão de resultado (placar, presença, estatísticas, contestação), com o Ranking e as modalidades do Início calculados de verdade e as filas de quadras e de W.O. da administração. As etapas 4 e 5 acrescentaram, no backend e na web, o chaveamento, a agenda e a decisão do organizador nos campeonatos e a corrida (marcas e elo por distância). A etapa 6 levou ao Expo as telas das etapas 1 a 5 (times, organizador, eventos, comprovantes, administração, Jogar, corrida e campeonatos), ainda sem validação em aparelho nem comparação visual com a web; o MVP completo não está declarado.

Leia o [plano inicial](docs/plano-criacao-inicial.md), as [decisões adotadas](docs/decisoes/0001-fundacao.md) e a [situação verificada](docs/situacao-fundacao.md).

## Pré-requisitos

- Python 3.13 e Node.js 24 LTS com npm.
- Docker Desktop funcionando, para PostgreSQL 16.
- Expo Go compatível com SDK 57 no aparelho, ou ambiente Android configurado. iOS pode ser aberto em aparelho físico; simulador iOS exige macOS.

## Banco e API

Comandos abaixo em PowerShell, começando na raiz:

```powershell
docker compose up -d
docker compose ps
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Espere o banco aparecer como `healthy`. A API não cria tabelas automaticamente: aplique migrações antes de iniciar. A migração `0004` aplicada por `alembic upgrade head` cria o nome de usuário (@) e gera um @ para cada conta existente, a partir do nome; contas com nomes parecidos recebem número no final. Também adiciona a referência da capa de perfil. A `0005` cria as tabelas de times, convites, pedidos de entrada, organizador, notificações, auditoria e elos (cortes e classificação, vazia até as partidas existirem). A `0008` cria eventos, inscrições, comprovantes (arquivo no MinIO, imagem ou PDF) e o canal de avisos dos eventos. Nenhuma das migrações apaga contas nem volumes. Em Linux/macOS, substitua `.venv/Scripts/python.exe` por `.venv/bin/python` e use `cp` para copiar arquivos.

API: [localhost:8000/docs](http://localhost:8000/docs). Saúde do processo: `/health/live`; prontidão do banco e esquema: `/health/ready`. O OpenAPI é gerado em `/openapi.json`.

### Forma recente do Ranking (recalcular uma vez após a `0013`)

A migração `0013` acrescenta a `standings` a forma recente (`recent_form`, os últimos 5 resultados V/E/D) e, na corrida, o dia da melhor marca (`best_mark_on`). Ela só cria as colunas vazias e não chama serviços da aplicação. Em cada ambiente, depois de `alembic upgrade head`, rode **uma vez**, em `backend/`:

```powershell
.venv/Scripts/python.exe -m app.admin_cli recalculate-rankings
```

O comando recalcula todas as categorias (times e individual por formato e posição, tênis e as cinco distâncias de corrida) e preenche as linhas antigas. É idempotente: uma segunda execução não altera nada e imprime `0 linhas alteradas`. Até ele rodar, as linhas antigas mostram a forma vazia (sem quadradinhos na tela), nunca uma forma errada; o próximo resultado de uma categoria também a preenche. O contrato está em [0002, seção 20](docs/decisoes/0002-jogar.md#20-ranking-por-elo-janela-forma-recente-e-salão).

### Imagens e avatar local

O Compose também fornece MinIO local, construído do código na versão fixada no `docker-compose.yml`, com API S3 em `localhost:9000`, console em `localhost:9001` e volume persistente `miniodata`. Inicie o serviço sem recriar nem apagar o PostgreSQL:

```powershell
docker compose up -d --build --wait minio
```

A compilação do MinIO faz até três tentativas, com pausa de cinco segundos entre elas, para tolerar falhas transitórias dos serviços de dependências do Go. Os downloads da tentativa anterior são reaproveitados e a verificação de integridade permanece ativa; se as três tentativas falharem, o build continua retornando erro.

Configure no `backend/.env` `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY` e `MEDIA_S3_SECRET_KEY`. Os valores de acesso precisam corresponder a `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD` usados pelo Compose; se forem alterados, mantenha ambos os arquivos locais alinhados. Os valores de exemplo servem somente para desenvolvimento local. Depois que o MinIO estiver healthy e o ambiente do backend estiver configurado, crie o bucket privado explicitamente:

```powershell
cd backend
.venv/Scripts/python.exe -m app.media_admin ensure-bucket
```

O bucket não é criado no startup da API. Para remover objetos com mais de 24 horas que não estejam vinculados a avatar, capa, post ou brasão de time, execute `.venv/Scripts/python.exe -m app.media_admin reconcile`. O comando preserva as imagens em uso, inclusive os brasões (`crests/{id}.webp`) dos times. As imagens passam pela API autenticada; não compartilhe credenciais ou links públicos. A implementação aceita JPEG, PNG e WebP estáticos até 5 MiB e 25 megapixels. Avatares são armazenados como WebP quadrado de até 512 px. Brasões de time seguem as mesmas regras, mas preservam a transparência (WebP com alfa), e são lidos por `GET /api/v1/teams/{id}/crest` com sessão. A capa de perfil (`/api/v1/me/cover`) usa recorte 5:2 de no máximo 1500×600 px, com os mesmos formatos e limites; na web ela é ajustada em Editar perfil › Foto de capa. A configuração de produção, provedor, HTTPS, política de backup e suporte do storage ainda precisa ser decidida.

### Link do time

O link e o QR do time apontam para `{PUBLIC_WEB_URL}/entrar/{token}`. Configure no `backend/.env`:

- `PUBLIC_WEB_URL`: endereço público da web, sem barra final (padrão `http://localhost:5173`). Fora de `ENVIRONMENT=development`, precisa usar `https`. Para abrir o link pelo celular na rede local, use o mesmo endereço da web aberto no aparelho.
- `TEAM_LINK_SECRET`: chave que deriva os tokens dos links; o banco guarda só um nonce e o hash. Em desenvolvimento, vazio usa um valor fixo de desenvolvimento; fora dele, é obrigatório, com pelo menos 32 caracteres e exclusivo do ambiente. Trocar o segredo invalida todos os links existentes. Não registre o valor real em arquivos versionados.

A web lê `/entrar/{token}` ao abrir, guarda o token em memória e limpa o endereço; quem não está logado entra (ou cria a conta) e segue para o pedido. Em desenvolvimento o Vite já serve o `index.html` nesse caminho; em produção, a hospedagem precisa devolver o `index.html` para `/entrar/*`, como em qualquer rota da aplicação de página única.

**O token do link é uma credencial:** quem o tem pode pedir para entrar no time. A API já mascara o caminho no log de acesso do uvicorn (`/api/v1/join/***` em `GET` e `POST /api/v1/join/{token}`), com um filtro instalado ao carregar `app.main`. Em produção, configure também o proxy reverso, o CDN ou a hospedagem da web para não registrar `/entrar/{token}` em claro: grave o caminho como `/entrar/***` no formato do log de acesso (no nginx, por exemplo, um `map $request_uri` que troque o trecho depois de `/entrar/` e de `/api/v1/join/`, usado num `log_format` próprio) ou desligue o log dessas rotas. Ferramentas de análise e monitoramento de erros da web também não devem coletar o endereço completo dessas páginas; a web limpa o endereço ao abrir (`history.replaceState`), o que reduz a exposição no histórico do navegador e no `Referer`, mas não alcança a primeira requisição, que chega ao servidor com o token.

Por padrão, banco `arena`, usuário/senha `arena` e porta `5432` são exclusivos de desenvolvimento. Para trocar, configure `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` no `.env` da raiz e ajuste `DATABASE_URL` no `.env` do backend. O driver da URL é explícito: `postgresql+psycopg2://`.

No Windows, se o Docker não iniciar, corrija a instalação ou use uma instância PostgreSQL própria e ajuste `DATABASE_URL`; não será possível usar o Compose até o engine estar disponível. A validação desta implementação usou uma instância isolada na porta 55432 devido a um erro local do Docker Desktop. Esse ambiente auxiliar não faz parte da instalação padrão.

Se o Compose estiver `healthy`, mas o Alembic tentar conectar à porta `55432`, o `backend/.env` ainda aponta para o ambiente auxiliar. Ajuste a porta de `DATABASE_URL` para `5432`, mantendo as credenciais do banco do Compose. O comando `if (!(Test-Path .env))` apenas cria o arquivo quando ele não existe; não atualiza configurações anteriores. Reinicie a API após alterar o `.env`. Os bancos de 5432 e 55432 têm dados independentes; trocar a conexão não transfere contas e perfis.

### Varredura periódica (eventos, inscrições, partidas, campeonatos e corrida)

Prazos de eventos não dependem de alguém abrir a tela: uma varredura registra o que venceu. Em desenvolvimento, deixe-a rodando num terminal próprio, no diretório `backend/`, com as migrações aplicadas (inclusive a `0008`, de eventos, inscrições e comprovantes, a `0009`, do Jogar, a `0010`, de chaveamento, decisões e classificação final, e a `0011`, das marcas de corrida):

```powershell
.venv/Scripts/python.exe -m app.admin_cli sweep --loop 60
```

Sem `--loop`, roda uma vez e termina; com `--loop 60`, repete a cada 60 segundos até Ctrl+C. Cada rodada imprime quantos itens cada tarefa mudou. As tarefas, nesta ordem, são:

- `reservas_expiradas`: inscrições pagas reservadas (ou com comprovante recusado) cujo prazo acabou, 48 h depois da inscrição ou 12 h antes do início, o que vier primeiro, viram `expirada` e liberam a vaga, com a notificação `reserva_expirada` ao atleta ou aos representantes e a auditoria `inscricao.expirada`;
- `devolucoes_recebidas`: devoluções por Pix de evento cancelado sem resposta do participante em 7 dias contam como recebidas (`devolvida`), com a notificação `devolucao_confirmada` ao organizador e aos participantes e a auditoria `devolucao.confirmada_automaticamente`.
- `buscas_expiradas`: buscas de partida que esperaram 24 h sem pareamento viram `expirada` (auditoria `busca.expirada`);
- `propostas_expiradas`: propostas de partida sem resposta em 2 h terminam; o lado que já tinha aceitado volta à fila com o prazo original da busca e tenta parear de novo, e quem não respondeu termina como `sem_resposta` (notificação `proposta_encerrada`); uma proposta por vez, com commit;
- `ofertas_expiradas`: ofertas de vaga ao avulso sem resposta em 2 h terminam (`sem_resposta`) e a vaga é oferecida ao próximo avulso da cidade; balde a balde, com commit;
- `pareamento`: refaz o pareamento das buscas que ficaram esperando, balde a balde (rede de segurança, por exemplo depois de uma queda);
- `resultados_vencidos`: 48 h depois do início, a amistosa sem placar confirmado pelos dois lados fica `sem_resultado`, o W.O. não contestado vale (3×0 no futebol, 6-0 6-0 no tênis) e a partida confirmada passa a `encerrada` (fim da janela de estatísticas); os rankings tocados são recalculados uma vez por rodada. O W.O. contestado espera a administração;
- `campeonatos_encerrados`: rede de segurança do encerramento. O evento em andamento cujas partidas já têm todas o resultado final (`realizada` ou `encerrada`) vai a `encerrado`, grava a classificação final e, no tênis com 4 ou mais inscrições confirmadas, o bônus do ranking (campeão +40, vice +20, semifinalistas ou 3º e 4º +10), com a notificação `evento_encerrado` e a auditoria `evento.encerrado`. Normalmente quem dá o último resultado já encerra o evento na mesma transação; esta tarefa cobre o caso em que a linha do evento estava ocupada;
- `rankings_janela`: partidas, marcas de corrida e bônus de campeonato do tênis que saíram das 52 semanas deixam de contar e os rankings afetados (inclusive os de corrida por distância) são recalculados.

As tarefas de partida, de campeonato e de ranking seguem a ordem global de travas de [decisões do Jogar](docs/decisoes/0002-jogar.md#155-ordem-global-de-travas-da-etapa-3). Rodar de novo não muda nada, e duas varreduras simultâneas não mudam o mesmo item duas vezes (`FOR UPDATE SKIP LOCKED`). As leituras da API já tratam os prazos sem esperar a varredura (uma reserva vencida aparece como expirada e não ocupa vaga; uma devolução com 7 dias já não aceita resposta), então o comando parado atrasa as notificações, a auditoria e a gravação do novo estado, sem liberar ações vencidas. A varredura usa o `DATABASE_URL` do `backend/.env`. O agendamento fora do desenvolvimento ainda será decidido na implantação.

## Web

Em outro terminal, a partir da raiz:

```powershell
cd web
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Abra [localhost:5173](http://localhost:5173). Em desenvolvimento, `VITE_API_URL` vazio usa o protocolo e o hostname da página, com a API na porta 8000. Assim, abrir por `localhost`, `127.0.0.1` ou pelo IP do computador mantém web e API no mesmo site. Uma URL explícita em `VITE_API_URL` tem precedência; se o `.env` existente ainda aponta para `localhost`, deixe o valor vazio para usar esse comportamento. Em produção, configure a URL apropriada da API. A configuração padrão autoriza ambas as origens locais da web; outros endereços exigem atualizar `ALLOWED_ORIGINS` no backend e reiniciá-lo.

### Acesso pelo celular na mesma rede

Identifique o IPv4 da interface de rede do computador (PowerShell: `Get-NetIPConfiguration`). Em `backend/.env`, acrescente `http://IP_DO_COMPUTADOR:5173` à lista JSON de `ALLOWED_ORIGINS`, mantendo as origens existentes; use endereços explícitos. Reinicie a API e mantenha o comando com `--host 0.0.0.0`. Com `VITE_API_URL=` em `web/.env` e o Vite reiniciado, abra `http://IP_DO_COMPUTADOR:5173` no navegador do celular. As portas 5173 e 8000 precisam estar acessíveis entre os dispositivos.

Para Expo Go, configure `EXPO_PUBLIC_API_URL=http://IP_DO_COMPUTADOR:8000` em `mobile/.env` e inicie ou reinicie com `npm start -- --lan`, em `mobile/`. Ao trocar a URL, use `npm start -- --lan --clear` para descartar transformações que ainda contenham o endereço anterior. Abra o endereço `exp://IP_DO_COMPUTADOR:8081` pelo Expo Go, ou o QR exibido pelo Expo. O cliente nativo usa Bearer e não envia `Origin`; CORS se aplica ao navegador. A porta do Metro pode variar se 8081 já estiver ocupada. Se o IP do computador mudar, atualize a origem autorizada e a URL do Expo. Essas configurações são para desenvolvimento local; produção mantém HTTPS, cookie seguro e as políticas de sessão documentadas.

## Comunidade, posts e moderação

Depois de aplicar as migrações com `alembic upgrade head`, a Comunidade usa posts com uma foto quadrada e legenda opcional. A web permite ajustar recorte e zoom; o Expo usa o seletor nativo com recorte 1:1. Curtidas, comentários, feed cronológico, busca por nome, galerias e relações são persistidos pela mesma API. A foto original permanece no dispositivo; a versão otimizada é armazenada no bucket privado.

Contas começam privadas. Seguidores de contas privadas precisam de aprovação; tornar uma conta pública mostra os posts a usuários autenticados e aprova pedidos pendentes. As solicitações para seguir ficam, provisoriamente, em Notificações. Editar perfil reúne foto, capa, nome, nome de usuário (@), visibilidade e contas bloqueadas; as listas de conexões, abertas pelas contagens do perfil, permitem remover seguidores e deixar de seguir. Bloquear remove relações nos dois sentidos. E-mail, nascimento e perfis esportivos continuam privados. Imagens sociais não usam bucket público nem URLs presigned.

Busca, galerias, comentários e gestão de relações permitem carregar páginas adicionais. As listas da API usam `{ items, next_cursor }`, inclusive `GET /api/v1/me/blocks`, com 20 itens por padrão e máximo de 50. O cursor deve ser reenviado na próxima chamada; não é uma autorização de acesso.

Denúncias ficam em Menu (hambúrguer do perfil) → Moderação, visível apenas para administradores web. Cada decisão exige justificativa e registra administrador, alvo, ação e data.

Uma conta suspensa pode ser reativada pela fila de denúncias resolvidas, com justificativa obrigatória. A fila informa o identificador e o estado da conta responsável sem expor conteúdo privado resolvido. A reativação preserva a revogação das sessões anteriores; o titular precisa entrar novamente.

Para nomear uma conta administrativa de modo explícito, entre em `backend/` e execute, com uma conta já cadastrada:

```powershell
.venv/Scripts/python.exe -m app.admin_cli promote-admin atleta@example.com
```

Esse comando altera apenas o papel da conta indicada; não é executado durante o cadastro nem na inicialização da API. Para remover o papel, use `remove-admin` com o mesmo e-mail. Consulte [plano de posts](docs/plano-posts.md) para contratos e critérios e [situação da fundação](docs/situacao-fundacao.md) para evidências e limitações.

## Mobile

Em outro terminal, a partir da raiz:

```powershell
cd mobile
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

Abra pelo Expo Go ou use `npm run android` com emulador configurado. Defina `EXPO_PUBLIC_API_URL` antes de iniciar:

| Ambiente | URL da API |
| --- | --- |
| Emulador Android padrão | `http://10.0.2.2:8000` |
| Aparelho físico na mesma rede | `http://IP_DO_COMPUTADOR:8000` |
| Simulador iOS no computador que executa a API | `http://localhost:8000` |

O backend deve escutar em `0.0.0.0`; aparelho e computador precisam alcançar a mesma rede e porta. `localhost` no aparelho aponta para o próprio aparelho. Mudanças na variável exigem reiniciar o Expo. Não coloque segredos em `EXPO_PUBLIC_*`.

**Use `https://` fora do desenvolvimento.** O app envia o token da sessão no cabeçalho `Authorization: Bearer` em toda chamada e ao carregar fotos, brasões e comprovantes. Por isso, em builds de teste compartilhados ou de produção, `EXPO_PUBLIC_API_URL` precisa ser `https://…`: com `http://` o token trafega em texto claro. O `http://` da tabela acima serve só para o emulador, o simulador e a rede local de desenvolvimento. O app não impõe o HTTPS por código (isso quebraria o desenvolvimento local): a escolha é da configuração. Por segurança, o app só anexa o token a caminhos da própria API (`/api/v1/...`); qualquer outro endereço de mídia recebido é ignorado.

### Telas e recursos do Expo (etapa 6)

O Expo tem as telas das etapas 1 a 5: Meus times, Convidar e Entrar pelo link, organizador, eventos e inscrições, comprovantes, administração, Jogar (placa, partida, resultado e Ranking), corrida e campeonatos (chaveamento, agenda e decisão). Elas consomem a mesma API e os mesmos contratos da web, então os roteiros "Demonstrar …" abaixo valem no Expo com as diferenças desta seção. **Nada disso foi verificado em aparelho, com leitor de tela ou contra a API real**, e a paridade visual com a web não foi verificada: os testes e a exportação do bundle não substituem esses ensaios.

- **Link do time:** o app entende `arena://entrar/{token}` (esquema `arena`, do `app.json`) e o endereço `http(s)://…/entrar/{token}` quando ele chega ao app; o token fica só em memória, até a pessoa entrar. O Expo Go não registra o esquema `arena` (usa `exp://`), então o `arena://` exige um build próprio, de desenvolvimento ou de produção. Em qualquer caso, "Entrar com QR" lê o QR do time dentro do app.
- **Câmera para o QR:** `expo-camera`, aberta só quando a pessoa toca em "Entrar com QR". A permissão é pedida nesse momento, com o texto configurado no `app.json` (o microfone fica desligado); sem a permissão, a tela diz o que fazer.
- **Comprovantes:** o envio aceita foto da galeria (`expo-image-picker`) ou documento (`expo-document-picker`). PDF só se abre e se salva pela web: o app mostra "Abra este comprovante pela web.".
- **Copiar Pix e link:** sem `expo-clipboard`, a chave Pix, o Copia e Cola e o link do time aparecem como texto selecionável, com o botão de compartilhar do sistema (`Share`).
- **Dependências acrescentadas no Expo**, todas aprovadas pelo usuário: `react-native-svg` (chaveamento e marca), `react-native-qrcode-svg` (QR do time), `expo-camera` (ler o QR) e `expo-document-picker` (comprovantes). `expo-clipboard`, `expo-file-system` e `expo-sharing` foram recusadas.
- **Marca:** `npm run generate:brand` (em `mobile/`) regenera `src/assets/brand-svgs.ts` a partir de `web/public/images/brand/*.svg`; rode depois de alterar esses SVGs. O arquivo gerado é versionado.
- **Verificação:** em `mobile/`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run export:android` e `npx expo install --check` (que hoje só aponta `expo@57.0.27` contra `~57.0.28`, um desvio conhecido). Os números e os pisos estão em [qualidade do código](docs/qualidade-codigo.md).

## Demonstrar a primeira entrega

1. Crie conta com nome, e-mail, nascimento elegível e senha de pelo menos 10 caracteres.
2. Entre, adicione perfis de futebol, tênis e corrida e selecione uma cidade do catálogo inicial.
3. Edite posição preferida no futebol, status de procura e nome.
4. Entre com a mesma conta no outro cliente e confira os dados.
5. Reinicie API/clientes e confirme a persistência. Saia e verifique que a sessão encerrada não funciona mais.

Opcionalmente, no diretório `backend/`, com migrações aplicadas:

```powershell
$env:ARENA_DEMO_PASSWORD='EscolhaUmaSenhaDeDemo'
.venv/Scripts/python.exe -m app.seed
```

O seed cria `atleta@example.com` com três perfis privados em Brasília. É idempotente, não redefine senha de conta existente e só roda em desenvolvimento. A senha vem da variável, não fica gravada no código. Não exponha esse ambiente de demonstração à internet.

## Demonstrar times e organizador (etapa 1, web)

Use três contas adultas com perfil de futebol e cidade (A, B e C) e promova C a administradora com `promote-admin`. Para o brasão, rode o MinIO e o `ensure-bucket` antes.

1. **Placa do Jogar:** com A, abra JOGAR. Em "Com meu time", sem time, a placa mostra "Você ainda não representa um time" e o botão "MEU TIME"; em "Avulso", a linha "Em classificação" com 0 de 3 partidas, sem elo, e o botão desabilitado com o aviso de que a busca chega numa próxima etapa.
2. **Criar time:** pelo botão ou por "Meu time", crie o time com nome, cidade (sugerida do perfil de futebol) e brasão (recorte quadrado; PNG com transparência mantém o fundo transparente).
3. **Convidar:** na carteirinha, "Convidar", busque B pelo nome ou @, escreva a mensagem e envie. Com B, o sino do Início mostra a não lida; em Notificações, tocar o convite abre Meus times com a folha do convite; aceite.
4. **Papéis:** com A, toque B no elenco: "Tornar representante" e "Tirar a braçadeira". O último representante não perde a braçadeira nem sai do time (o servidor responde `409`). Depois, "Remover do time".
5. **Link e QR:** na carteirinha, o ícone de QR mostra o link. Abra o link deslogado como C, entre e toque "Pedir para entrar"; A recebe a notificação, que leva a "Pedidos para entrar", e aprova. "Gerar outro link" invalida o anterior ("Este link não vale mais").
6. **Encerrar:** em Editar time, "Encerrar time" com confirmação; o time some de Meus times, o link deixa de valer e os membros recebem o aviso.
7. **Organizador:** com B, Perfil › Menu › "Quero organizar" e envie o pedido. Com C, Menu › Administração › "Pedidos de organizador" (com o contador): recuse com motivo. B vê a recusa nas notificações e no Menu, envia um novo pedido, e C aprova; o Menu de B passa a mostrar a seção Organizador, ainda sem eventos.
8. **Persistência:** recarregue a página e confira times, elenco, pedidos e o estado do organizador.

## Demonstrar eventos e inscrições (etapa 2, web)

Rode o MinIO e o `ensure-bucket` (comprovantes são arquivos privados) e deixe a [varredura](#varredura-periódica-eventos-inscrições-partidas-campeonatos-e-corrida) num terminal, se quiser ver prazos vencerem. Use cinco contas adultas com cidade: **ADM** (promovida com `promote-admin`), **ORG** (organizadora), **REP** (representante de um time de futebol, de [Meus times](#demonstrar-times-e-organizador-etapa-1-web)), **ATL** (atleta de tênis) e **MEM**, opcional, para o link do time.

1. **Permissão:** ORG, Perfil › Menu › "Quero organizar" e envie o pedido (futebol e tênis). ADM aprova em Menu › Administração › "Pedidos de organizador". O Menu de ORG passa a mostrar a seção Organizador.
2. **Evento gratuito:** ORG, Menu › "Criar evento" (ou Meus eventos › "Novo evento"). O Criar evento faz uma pergunta por vez: Enter avança, a seta volta e "Salvar rascunho" grava a qualquer momento. Escolha tênis, todos contra todos, 6 vagas, aberto a todos, datas, cidade, local e "Gratuita": "Publicar" abre a gestão com as inscrições abertas. Recarregue e confira Meus eventos.
3. **Inscrição do atleta:** ATL, JOGAR › aba Tênis › "Campeonatos" › o evento › "Inscrever-se · Grátis". A inscrição é confirmada na hora e aparece em Minhas inscrições, também depois de recarregar.
4. **Evento pago:** ORG cria um evento de futebol (society, eliminação simples, 8 vagas), escolhe "Paga", informa o valor e o Pix (favorecido, tipo e chave, Copia e Cola e instruções) e toca "Enviar para aprovação". O evento fica "Em aprovação". ADM abre Menu › "Eventos pagos" (com o contador), confere a folha com o Pix informado e "Aprovar e publicar" (ou recusa com motivo: o evento volta a rascunho, e ORG corrige e reenvia).
5. **Reserva e comprovante:** REP, JOGAR › "Campeonatos" › o evento › "Inscrever {time} · R$ …" › "Reservar vaga". A folha mostra o Pix do organizador; "Copiar chave Pix" usa a área de transferência (precisa de gesto do usuário). Depois do pagamento, "Enviar comprovante" aceita imagem JPEG, PNG ou WebP ou PDF até 5 MiB; o estado vira "Comprovante em análise".
6. **Análise (A2):** ORG recebe a notificação "Novo comprovante", que abre Comprovantes (aba "Para analisar" com o contador). Abra a linha, confira o valor, o favorecido e a chave esperados e **recuse** com um motivo (o detalhe é obrigatório em "Outro"). REP vê a recusa (notificação e detalhe) e "Enviar outro" até o fim da reserva; o reenvio aparece como "2ª tentativa", com a recusa anterior preservada, e ORG aprova: a inscrição fica confirmada.
7. **Avisos:** na gestão, "Novo aviso" › "Publicar aviso". REP recebe a notificação e lê o aviso em "Avisos do organizador" no detalhe.
8. **Cancelamento e devolução:** ORG, gestão › "Cancelar evento" (motivo de 5 a 500 caracteres, com confirmação). As inscrições pagas viram "Devolução pendente", e o aviso automático sai no canal. Em Comprovantes › "Devoluções", ORG anexa o comprovante da devolução de cada inscrição. REP vê "Devolução enviada pelo organizador" e escolhe "Confirmar recebimento" ou "Contestar" (motivo de 5 a 500 caracteres); sem resposta em 7 dias, conta como recebida (varredura).
9. **Contestação:** ADM, Menu › "Devoluções contestadas" (ou pela notificação) abre a folha com o comprovante, o motivo e o histórico, e decide "Devolução feita" ou "Pedir outro" (com motivo). Com "Pedir outro", ORG recebe a notificação e anexa outro comprovante.
10. **Revogação:** ADM revoga a permissão de ORG (Menu › "Pedidos de organizador" › aba "Organizadores"). Os eventos com inscrições ficam com as inscrições suspensas e aparecem em Menu › "Eventos de organizador revogado", onde ADM escolhe "Seguir evento" ou "Cancelar evento"; ORG recebe a notificação da decisão e, se o evento for cancelado, os inscritos recebem o aviso de cancelamento.
11. **Notificações:** em cada papel, o sino do Início mostra a não lida, e tocar abre a tela do assunto (detalhe do evento, gestão, comprovantes ou a fila da administração); "Voltar" retorna às Notificações.
12. **Link do time com a sessão expirada:** abra `/entrar/{token}` de um time com MEM logado, apague o cookie de sessão e toque "Pedir para entrar": a web volta ao login com o aviso de sessão expirada, e o mesmo link reabre depois de entrar.

Telas e dados vêm todos da API; sem evento ou inscrição, as telas mostram o estado vazio. O chaveamento e a tabela dos campeonatos estão em [Demonstrar o campeonato pela API](#demonstrar-o-campeonato-pela-api-etapa-4-backend) e as partidas dos amistosos, em [Demonstrar o Jogar pela web](#demonstrar-o-jogar-pela-web-etapa-3-web).

## Demonstrar o Jogar pela web (etapa 3, web)

Rode a API com as migrações até a `0009` (a seção "Banco e API"), a [varredura](#varredura-periódica-eventos-inscrições-e-partidas) num terminal (`python -m app.admin_cli sweep --loop 60`) e a web (`npm run dev`, em `web/`). Use sete contas adultas em Brasília (cadastradas pela web ou pela API): **ADM** (promovida com `promote-admin`), **REP-A** e **REP-B** (representantes de dois times de futebol criados em [Meus times](#demonstrar-times-e-organizador-etapa-1-web)), **MEM** (membro do time A, por convite), **AVU** (perfil de futebol, procurando partida) e **TEN-A** e **TEN-B** (perfis de tênis). Cada papel entra numa sessão separada (um navegador por conta, ou uma janela anônima).

1. **Busca e proposta:** REP-A, JOGAR › "Com meu time" › o botão redondo abre "Preparar busca": formato Society, desligue "O time está completo?" e abra vagas de goleiro e de atacante para avulsos. Com REP-B buscando no mesmo formato (time completo), o pareamento é imediato e a **proposta abre em tela cheia** para os dois, com a contagem de 2 h; REP-B "Aceitar partida" e espera. REP-A vê a proposta (ao entrar na placa ou pela notificação "Partida encontrada") e aceita: os dois seguem para a **tela da partida**, e o ponto menta do JOGAR acende enquanto há busca, proposta ou partida combinando. "Responder depois" mantém a proposta na placa e nas notificações até o prazo.
2. **Condições e quadra:** na tela da partida, "Propor condições" (Date Picker, horário em passos de 15 min, quem reserva). Escolha uma quadra do catálogo ou "Sugerir outra quadra": ela fica "Sugestão em revisão" e vale só nessa partida. ADM publica em Menu › Administração › "Sugestões de quadra" (com o contador); o outro lado "Aceitar condições" e a partida fica **agendada**; quem reserva com o local confirma em "Reserva confirmada". As vagas declaradas na busca aparecem em "Vagas para avulsos" (Ajustar).
3. **Avulso:** AVU, JOGAR › "Avulso" › "Qualquer posição" › o botão redondo: a vaga aparece em tela cheia ("Quero jogar"), e AVU entra na partida e no chat só dessa partida. Reduzir as vagas (Ajustar) retira a oferta pendente e avisa o avulso.
4. **Chat e moderação:** os dois lados e o avulso conversam (Enter envia, Shift+Enter quebra a linha); o ícone de bandeira denuncia a mensagem de outro participante. ADM abre Menu › "Denúncias" (com o contador), escolhe "Remover mensagem" com a justificativa: o texto some para todos ("Mensagem removida").
5. **Resultado:** depois do horário (para demonstrar sem esperar, ajuste `starts_at` e `result_deadline` da partida só no seu banco de desenvolvimento), a tela mostra o cartão de resultado: "Revisar elenco" marca presença; REP-A informa o placar e REP-B vê só "Ferrugem FC já informou o placar" (o placar do outro lado não aparece antes do seu); com os dois placares iguais, o resultado é confirmado e o Ranking (Futebol › Times › Society) e o cartão "Seu elo" do Início passam a refletir. Cada atleta envia as suas estatísticas ("Suas estatísticas"); o representante do time adversário pode contestar um item uma vez, e o representante do atleta revisa. Com placares diferentes, o cartão mostra os dois e "Corrigir o meu" e "Conversar"; sem acordo em 48 h, a varredura fecha a partida como "sem resultado".
6. **W.O. e cancelamento:** no cartão de condições, "Registrar W.O." (só depois do horário e antes do placar do outro lado) e "Contestar W.O." pelo lado ausente; a contestação vai para Menu › "W.O. contestados", onde ADM lê os dois relatos e o chat e "Manter o W.O." ou "Anular". "Cancelar partida" vale até 24 h antes do horário, com motivo opcional.
7. **Tênis:** TEN-A e TEN-B buscam pela aba Tênis; ao propor condições, ligue "Super tie-break" para o desempate do 3º set; o placar é informado em sets (o 3º set vira os pontos do super tie-break).
8. **Início e notificações:** o cartão "Próxima partida" do Início mostra a partida agendada mais próxima e abre a tela dela; cada notificação do Jogar abre a placa (proposta ou oferta daquela partida), a tela da partida ou a fila da administração, com a aba JOGAR (ou Perfil, nas filas) acesa.

Tudo vem da API; sem busca, partida ou ranking, as telas mostram o estado vazio. Os campeonatos (chaveamento e partidas de campeonato) e a corrida têm roteiros próprios mais abaixo, e o Expo tem estas telas desde a etapa 6 (veja [Mobile](#telas-e-recursos-do-expo-etapa-6)), ainda sem validação em aparelho.

## Demonstrar o Jogar pela API (etapa 3, backend)

Com a API em `http://127.0.0.1:8000`, as migrações até a `0009` aplicadas e a [varredura](#varredura-periódica-eventos-inscrições-partidas-campeonatos-e-corrida) rodando, este roteiro, em PowerShell, cria dois times em Brasília, pareia os dois e leva a partida a `combinando`. A cidade do perfil de futebol vem do cadastro, e `promote-admin` dá a administração a uma conta (ela publica quadras e decide W.O.).

```powershell
$api = 'http://127.0.0.1:8000/api/v1'
function Arena($method, $path, $token, $body = $null) {
  $request = @{ Method = $method; Uri = "$api$path"; Headers = @{ Authorization = "Bearer $token" } }
  if ($method -in 'POST', 'PUT', 'PATCH') {
    $request.ContentType = 'application/json'
    $request.Body = ($(if ($body) { $body } else { @{} }) | ConvertTo-Json -Depth 5)
  }
  Invoke-RestMethod @request
}
# $a e $b: tokens de POST /auth/login de duas contas adultas
$timeA = (Arena POST '/teams' $a @{ name = 'Ferrugem FC'; city_id = 5300108 }).id
$timeB = (Arena POST '/teams' $b @{ name = 'Tigres do Lago'; city_id = 5300108 }).id
Arena POST '/matchmaking/searches' $a @{ sport = 'futebol'; team_id = $timeA; format = 'society'; open_slots = @{ atacante = 1 } } | Out-Null
$busca = Arena POST '/matchmaking/searches' $b @{ sport = 'futebol'; team_id = $timeB; format = 'society' }
$partida = $busca.proposal.match_id                      # a segunda busca já nasce com a proposta
Arena PUT "/matches/$partida/accept" $a | Out-Null        # aceite do primeiro lado
(Arena PUT "/matches/$partida/accept" $b).state           # combinando: o chat abre
```

O restante do fluxo usa as rotas do [contrato](docs/decisoes/0002-jogar.md), sempre com o titular vindo da sessão e corpo JSON (mesmo `{}`):

1. **Condições:** `POST /courts/suggestions` (a quadra fica em revisão e vale só nessa partida), `POST /matches/{id}/terms` (data em passos de 15 min, quadra, quem reserva), `POST /admin/court-suggestions/{id}/decision` (`publicar`) e, pelo outro lado, `PUT /matches/{id}/terms/{terms_id}/accept`: a partida fica `agendada` e as vagas declaradas abrem para avulsos.
2. **Avulso:** com a busca `POST /matchmaking/searches {"sport":"futebol"}` ("qualquer posição"), o atleta recebe a oferta (`GET /me/slot-offers` e a notificação `vaga_encontrada`) e entra com `PUT /match-slots/{id}/accept`. Reduzir as vagas (`PUT /matches/{id}/slots`) tira a oferta pendente e avisa o avulso (`oferta_retirada`).
3. **Chat e denúncia:** `GET` e `POST /matches/{id}/messages`; `POST /reports {"target_type":"match_message",…}` e, com a administração, `POST /admin/reports/{id}/decision {"action":"remove",…}`.
4. **Resultado:** depois do horário, os dois lados fazem `PUT /matches/{id}/result` (`{"goals_a":3,"goals_b":1}` ou, no tênis, `{"sets":[…]}`); `PUT /matches/{id}/attendance`, `PUT /matches/{id}/my-stats`, a revisão e a contestação das estatísticas; depois `GET /rankings?sport=futebol&kind=time&format=society` e `GET /me/standings`.
5. **Prazos e W.O.:** `POST /matches/{id}/cancel` (até 24 h antes), `POST /matches/{id}/walkover` e a contestação, `GET /admin/walkover-disputes` e `POST /admin/matches/{id}/walkover-decision`. Placares divergentes, depois de 48 h, e W.O. sem contestação fecham pela varredura (`resultados_vencidos`).

## Demonstrar a corrida pela API (etapa 5, backend)

Com a API em `http://127.0.0.1:8000`, as migrações até a `0011` aplicadas e a [varredura](#varredura-periódica-eventos-inscrições-partidas-campeonatos-e-corrida) rodando, a marca é do próprio atleta (autodeclarada, sem comprovação) e o titular vem da sessão. Em PowerShell, reaproveitando a função `Arena` do roteiro do Jogar, com `$a` o token de uma conta adulta:

```powershell
$treino = @{ distance_m = 5000; duration_s = 1500; source = 'treino' }          # 5 km em 25:00
(Arena POST '/me/runs/preview' $a $treino).impact                               # primeira_marca, elo estimado (nada é gravado)
$marca = Arena POST '/me/runs' $a $treino                                       # grava e recalcula o ranking dos 5 km
$marca.impact                                                                   # tier_after exato, inclusive Lendário
(Arena GET '/me/run-bests' $a).items | Where-Object { $_.distance_km -eq 5 }  # melhor tempo, série e elo da distância
(Arena GET '/rankings?sport=corrida&distance_km=5' $a).items                    # metric_value: melhor tempo em segundos
Arena POST '/me/runs' $a @{ distance_m = 5000; duration_s = 1440; source = 'treino' } | Out-Null   # novo melhor, sobe no ranking
Arena DELETE "/me/runs/$($marca.run.id)" $a                                     # remove o erro de digitação e recalcula
```

Detalhes do [contrato, seção 18](docs/decisoes/0002-jogar.md#18-fase-6--corrida-marcas-e-elo-por-distância): a distância é a padrão mais próxima com tolerância de 2% (3, 5, 10, 21 e 42 km); uma corrida de 7 km fica só no histórico (`GET /me/runs?distance=outra`) e não toca ranking; o primeiro tempo já classifica; menor tempo vence e, no empate, vale quem correu primeiro. Para a "Prova do Arena", `GET /me/run-races` lista as provas com inscrição confirmada e largada passada; `POST /me/runs` com `{"source":"prova","entry_id":…,"distance_m":…,"duration_s":…}` registra uma só marca por inscrição (um segundo toque responde `409`).

**Pela web (etapa 5):** em Jogar, escolha Corrida e uma distância. REGISTRAR abre o cronômetro (tempo digitado, "Treino" ou "Prova do Arena", com a prévia do que a marca muda no ranking); "Suas marcas" mostra o melhor tempo, o elo e a evolução de cada distância, com o histórico e a remoção de marcas; e "Ver ranking" abre o Ranking já na corrida e na distância escolhida. A "Prova do Arena" pede uma inscrição confirmada numa prova cuja largada já passou: para testar sem esperar, ajuste o `starts_at` do evento no **banco de teste**, nunca no banco real.

## Demonstrar o campeonato pela API (etapa 4, backend)

Parta de um campeonato de tênis ou futebol criado e publicado como no [roteiro de eventos](#demonstrar-eventos-e-inscrições-etapa-2-web) (organizador aprovado, `competition_type` `eliminacao_simples` ou `todos_contra_todos`, `registration_closes_at` a poucos minutos) com 4 inscrições confirmadas; depois do fim das inscrições, o organizador (`$org`) conduz o campeonato, sempre com corpo JSON (mesmo `{}`; a função `Arena` do roteiro do Jogar já envia corpo também em `PATCH`):

```powershell
$evento = 42                                                                    # id do evento publicado
Arena POST "/organizer/events/$evento/bracket" $org | Out-Null                  # sorteia (semente guardada; sortear de novo troca o sorteio)
Arena PATCH "/organizer/events/$evento/bracket" $org @{ a = 0; b = 3 } | Out-Null   # troca dois lugares antes de confirmar
Arena POST "/organizer/events/$evento/bracket/confirm" $org | Out-Null          # gera as partidas e leva o evento a em_andamento
$partidas = (Arena GET "/organizer/events/$evento/matches" $org).items          # J1, J2…, com can_schedule e awaiting_decision
$quadra = 1                                                                     # id de uma quadra publicada (GET /courts)
Arena PUT "/organizer/matches/$($partidas[0].card.id)/schedule" $org @{ starts_at = '2026-11-20T18:00:00-03:00'; court_id = $quadra }
```

Uma agenda a menos de 2 h de outra partida na mesma quadra, ou do mesmo time ou atleta, responde `409 { "detail": …, "conflict": { kind, match_id, label, stage, starts_at, court_name } }`. Depois do horário, os dois lados informam o placar como num amistoso (`PUT /matches/{id}/result`); placares iguais confirmam, recalculam o ranking e **levam o vencedor** à partida seguinte (a eliminação não aceita empate). Se os placares divergirem, ou 48 h passarem sem resultado, ou houver W.O., o organizador decide com justificativa de 5 a 500 caracteres:

```powershell
Arena POST "/organizer/matches/$($partidas[0].card.id)/result-decision" $org @{ score = @{ goals_a = 2; goals_b = 1 }; justification = 'Conferido com os dois times.' }   # no tênis: score = @{ sets = @(…) }
Arena POST "/organizer/matches/$($partidas[1].card.id)/result-decision" $org @{ walkover_absent_side = 'b'; justification = 'O time B não compareceu.' }   # W.O.: 3×0 (futebol) ou 6-0 6-0 (tênis)
Arena GET "/events/$evento/bracket" $org                                        # árvore ou tabela; placements aparecem quando o evento encerra
```

Quando a última partida recebe o resultado final, o evento vai a `encerrado` na mesma transação (a tarefa `campeonatos_encerrados` da varredura cobre o caso em que a linha do evento estava ocupada) e, no tênis com 4 ou mais inscrições confirmadas, o bônus entra no ranking do tênis (`GET /rankings?sport=tenis`). Cancelar o evento (`POST /organizer/events/{id}/cancel`) cancela as partidas abertas. Contrato: [0003, seção 21](docs/decisoes/0003-times-campeonatos.md#21-etapa-4--chaveamento-agenda-e-decisão-do-organizador-fases-6-e-7) e [0002, seção 17](docs/decisoes/0002-jogar.md#17-uso-nas-partidas-de-campeonato-etapa-4).

**Pela web (etapa 4):** em Perfil, Menu, Meus eventos, abra o evento. Depois do fim das inscrições, a gestão oferece "Sortear chaveamento" (ou "Sortear rodadas", no todos contra todos); na tela do chaveamento, toque em dois times para trocá-los de lugar e confirme. "Partidas" lista os jogos e abre a folha de agenda (Date Picker, horário livre e quadra, com o conflito de 2 h na própria folha); a divergência chega por notificação e abre a decisão (o placar de um lado, outro placar ou W.O., com justificativa); o canal de avisos fica no fim da gestão. Os inscritos veem a chave ou a tabela na aba "Tabela" do detalhe do evento. Para testar as partidas sem esperar o horário, ajuste `registration_closes_at` e `starts_at` dos eventos e das partidas no **banco de teste**, nunca no banco real.

## Validação

No diretório `backend/`:

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg2://arena:arena@localhost:5432/arena'
.venv/Scripts/python.exe -m ruff check app migrations tests
.venv/Scripts/python.exe -m alembic check
.venv/Scripts/python.exe -m pytest -q
```

Os testes criam e removem somente um schema aleatório próprio no PostgreSQL indicado. A credencial precisa de permissão para criar schemas. Sem `TEST_DATABASE_URL`, testes de integração ficam pulados; isso não comprova a entrega. Para executar só unidades, use `pytest tests/unit -q` pelo Python do ambiente.

No diretório `web/`: `npm run lint`, `npm run typecheck`, `npm run build` e `npm run test:coverage`. No diretório `mobile/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run export:android` e `npx expo install --check` (que hoje só aponta `expo@57.0.27` contra `~57.0.28`, um desvio conhecido). O workflow `.github/workflows/ci.yml` executa os checks com PostgreSQL e ambos os clientes. A geração do bundle não substitui validação Android/iOS em aparelho.

Sessões expiram em 24 horas, não têm renovação automática e são revogadas no logout. Na web o token fica em cookie HttpOnly; no mobile, no SecureStore. Perfis sociais públicos são distintos dos perfis esportivos, que continuam privados. Para ambiente fora de desenvolvimento, configure `COOKIE_SECURE=true`, HTTPS, origens explícitas e infraestrutura conforme as decisões documentadas.

## Estrutura

```text
backend/app/          configuração, modelos, schemas, rotas e serviços
backend/migrations/  esquema versionado com Alembic
backend/tests/       unidades e integração PostgreSQL
web/src/             API, páginas e componentes React
mobile/src/          API, telas e componentes React Native
docs/                especificações, decisões e evidências de execução
```

Pare o banco com `docker compose down`; o volume `pgdata` mantém os dados para a próxima execução. Evite remover o volume se precisar preservar contas e perfis.

## Testes unitários e cobertura

Os clientes possuem `npm test` e `npm run test:coverage`, executados em `web/` ou `mobile/`. No backend, execute `pytest tests/unit -q --cov=app --cov-branch` pelo Python da `.venv`; para incluir integração, configure `TEST_DATABASE_URL` e execute `pytest -q --cov=app --cov-branch`.

Resultados, escopos e pisos de cobertura estão em [qualidade do código](docs/qualidade-codigo.md). O CI executa as suítes e publica relatórios em artifacts e no resumo de cada job. Relatórios locais ficam em `artifacts/coverage/`, sem versionamento. Testes isolados de SecureStore usam um double e não comprovam armazenamento seguro em aparelho.
