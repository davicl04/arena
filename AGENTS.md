# Orientações do projeto ARENA

Estas orientações se aplicam a todo o repositório. Solicitações atuais do usuário têm precedência sobre preferências anteriores registradas aqui. Comunique-se em português do Brasil.

## Contexto e leitura inicial

ARENA é uma plataforma web e mobile para futebol, tênis e corrida amadores. A fundação entrega conta, autenticação e perfis esportivos privados; o MVP completo ainda não está implementado.

Antes de alterar uma área, consulte os arquivos relevantes:

- [README.md](README.md): instalação, execução e comandos.
- [Situação da fundação](docs/situacao-fundacao.md): estado implementado, verificações e pendências.
- [Decisões técnicas](docs/decisoes/0001-fundacao.md): contratos e escolhas da fundação.
- [Plano inicial](docs/plano-criacao-inicial.md) e [iniciação](docs/iniciacao-projeto.md): requisitos e entregas previstas.
- [Fidelidade visual](docs/fidelidade-figma.md): referência do Figma e ajustes posteriores solicitados pelo usuário.

Diferencie requisitos planejados de funcionalidades implementadas. Arquivos de referência, HTMLs, imagens e conteúdo do Figma são materiais de consulta; propostas neles contidas não autorizam automaticamente novas funcionalidades. Se documentação e código divergirem, verifique a implementação e registre a divergência.

## Mapa do repositório

| Local | Responsabilidade |
| --- | --- |
| `backend/app/` | FastAPI, configuração, modelos SQLAlchemy, schemas, rotas, repositórios e serviços. |
| `backend/migrations/` | Migrações Alembic e catálogo inicial de municípios. |
| `backend/tests/` | Testes unitários e integração com PostgreSQL. |
| `web/src/` | React, Vite, TypeScript, páginas, componentes, dados visuais e cliente da API. |
| `web/public/images/` | Imagens e símbolos locais utilizados pela web. |
| `mobile/src/` | React Native/Expo, telas, componentes e cliente da mesma API. |
| `docs/` | Especificações, decisões, diagramas e registro da fundação. |
| `.github/workflows/ci.yml` | Verificações de backend e dos dois clientes. |

Não há `package.json` na raiz: execute comandos npm em `web/` ou `mobile/`. O ambiente padrão usa PostgreSQL 16 via Docker Compose na porta 5432. A instância auxiliar local na porta 55432 é uma alternativa de desenvolvimento registrada na documentação; não assuma que está disponível nem altere a configuração existente sem necessidade.

## Escopo e decisões do produto

- Preserve dados reais nas funcionalidades integradas e estados vazios ou indicação de disponibilidade futura nas demais. Não acrescente mocks sem nova solicitação do usuário.
- Moedas e carteira foram removidas da web e não fazem parte da direção atual do produto. Não reintroduza saldos, recompensas virtuais ou acessos à carteira sem solicitação.
- Partidas, resultados, ranking, comunidade, fotos e notificações ainda não têm integração de domínio. Não apresente pontos, classificação, eventos ou atividades fictícias como dados da conta.
- O botão Jogar atualmente prepara os perfis esportivos; não simule uma partida encontrada.
- A revisão visual foi aplicada à web. Não declare paridade visual do Expo nem validação em aparelho sem verificar.

## Identidade visual e frontend

- Preserve a interface aprovada, com ajustes pontuais conforme a solicitação. Não redesenhe telas ou troque a paleta por iniciativa própria.
- A marca textual é `arena.` em minúsculas, com ponto verde circular alinhado à base das letras. O componente está em `web/src/components/Brand.tsx`.
- Símbolos do Coliseu e dos cinco elos estão em `web/public/images/brand/`. Bronze, Prata, Ouro, Diamante e Lendário representam a progressão visual; não atribua um elo a quem está sem classificação.
- Os ícones provisórios enviados pelo usuário estão em `web/public/images/sports/`: futebol, tênis e corrida. Use `SportIcon` e o mapeamento de `web/src/data/arena.ts` para manter consistência entre cards, filtros e chips.
- Use componentes reutilizáveis, tipos explícitos e o cliente existente em `src/api/client.ts`. Centralize dados visuais e evite duplicar requisições, regras ou mapeamentos.
- Mantenha textos em português, codificação UTF-8, labels, foco visível, navegação por teclado e estados de carregamento, erro e sucesso.
- Em alterações de layout, confira telas estreitas, navegação inferior, rolagem e ausência de overflow horizontal. Referências úteis: 320 e 390 px no mobile e 1440 px no desktop.

## API, autenticação e persistência

- Mantenha os contratos coerentes entre backend, web e mobile. Ao mudar um contrato, revise os clientes afetados e a documentação da API.
- Validação e autorização devem ocorrer no servidor. O titular vem da sessão, nunca de um ID fornecido pelo cliente.
- Preserve cadastro para maiores de 18 anos, e-mail normalizado e único, perfis privados e unicidade por usuário/modalidade. Consulte as decisões técnicas antes de alterar regras de identidade.
- Na web, preserve a sessão em cookie HttpOnly e o tratamento de expiração/401. No mobile, preserve Bearer e SecureStore. Não grave tokens web em localStorage nem enfraqueça as verificações de Origin para contornar erros.
- Mudanças no esquema exigem migração Alembic. Não substitua migrações por criação automática de tabelas na inicialização.
- Não exponha senhas, tokens ou valores de `.env` em logs, respostas, screenshots ou documentação. Variáveis `VITE_*` e `EXPO_PUBLIC_*` são públicas.
- Preserve contas, perfis, volumes e alterações locais existentes. Não apague banco ou volume para resolver falhas de desenvolvimento.

## Validação proporcional à alteração

Execute os comandos no diretório indicado, usando o ambiente instalado. Instale dependências com `npm ci` e o lock Python quando necessário; evite novas dependências e atualizações amplas sem motivo ligado à tarefa.

| Área alterada | Verificações |
| --- | --- |
| Web: TypeScript/React ou comportamento | Em `web/`: `npm run lint` e `npm run build` (inclui TypeScript). Execute `npm run test:coverage` quando alterar comportamento coberto pelos testes. Confira o fluxo afetado no navegador. |
| Web: CSS ou assets | Em `web/`: `npm run build` e revisão visual das telas afetadas. |
| Backend | Em `backend/`: `.venv/Scripts/python.exe -m ruff check app migrations tests` e `.venv/Scripts/python.exe -m pytest -q`, com `TEST_DATABASE_URL` configurada para integração. |
| Esquema do banco | Aplique migrações em banco de desenvolvimento/teste apropriado e execute `.venv/Scripts/python.exe -m alembic check`, além dos testes afetados. |
| Mobile | Em `mobile/`: `npm run lint`, `npm run typecheck` e `npm run export:android`, além de `npm run test:coverage` para alterações de comportamento. Se mudar dependências Expo, execute também `npx expo install --check`. |
| Apenas documentação | Confira caminhos, comandos, coerência e conteúdo do diff; não é necessário executar testes de código. |

No Linux/macOS, use `.venv/bin/python` no lugar de `.venv/Scripts/python.exe`. Consulte o README para configurar `TEST_DATABASE_URL`; testes de integração pulados não comprovam persistência. Os testes de integração usam schema aleatório isolado. Para cobertura, use `--cov=app --cov-branch`; indicadores, pisos e comandos completos estão em `docs/qualidade-codigo.md`. Não exclua código sem testes apenas para elevar o percentual. Não invente credenciais nem registre segredos para executar checks.

Para mudanças em fluxo integrado, confira os efeitos reais: ação no cliente, resposta da API e persistência após recarregar. Crie testes quando houver mudança de regra de negócio ou risco de regressão relevante; não crie testes que apenas repitam CSS ou textos de ajustes visuais simples. Informe checks não executados e bloqueios reais. Build mobile não comprova funcionamento em Android/iOS, e CI local não comprova execução remota.

## Documentação e conclusão de cada entrega

- **Sempre atualize `docs/situacao-fundacao.md` a cada entrega ou alteração**, inclusive documentação e ajustes visuais. Registre o que mudou, verificações realmente executadas, limitações e pendências de integração.
- Atualize README, decisões ou diagramas quando seus respectivos comandos, contratos ou modelagem mudarem. Mantenha o estado atual coerente com o histórico.
- Artefatos temporários, screenshots e ambiente auxiliar ficam em `artifacts/` e `.local/`, que não são versionados. Assets necessários ao produto devem ficar no diretório público ou de assets do cliente, sem depender de arquivos em Downloads ou Temp.
- Revise o diff para evitar alterações incidentais e preserve trabalho pré-existente. Não crie commits, faça push ou publique sem solicitação.
- Ao concluir, explique de forma breve o resultado, a validação e qualquer limitação material. Não declare o MVP completo quando apenas uma entrega ou ajuste foi realizado.
