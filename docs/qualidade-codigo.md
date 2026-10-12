# Qualidade do código e testes da fundação

Verificação local: 9 de outubro de 2026. Escopo: fundação implementada; não representa o MVP completo.

## 3.1 Código-fonte

Repositório: [davicl04/arena no GitHub](https://github.com/davicl04/arena). O código é organizado em backend FastAPI/Python, web React/TypeScript e mobile React Native/Expo. As orientações de desenvolvimento estão em `AGENTS.md`, os contratos e decisões em `docs/decisoes/0001-fundacao.md` e a execução em `README.md`.

Padrões de qualidade adotados:

- Python: Ruff com regras E (erros de estilo), F (problemas de código) e I (organização de imports), configurado em `backend/pyproject.toml`; E501 está explicitamente desabilitada.
- Clientes: TypeScript para verificação de tipos e ESLint, com configurações próprias de web e mobile.
- Persistência: esquema versionado com Alembic, validação de dados e autorização no servidor.
- Reprodutibilidade: dependências fixadas em arquivos de lock e workflow de CI em `.github/workflows/ci.yml`.
- Desenvolvimento: componentes reutilizáveis, preservação de dados reais, acessibilidade e atualização do registro da fundação.

Ruff, lint e TypeScript dos dois clientes, build web e testes locais passaram nesta entrega. A exportação Android também passou. O workflow foi atualizado, mas ainda não houve execução remota comprovada desta versão.

## 3.2 Testes de unidade

Os testes do backend cobrem idade adulta, normalização de e-mail, hash de senha, criação de sessão, autenticação, contas inativas, expiração, proteção de Origin e validação de campos controlados pelo servidor. Repositórios/sessões de banco são substituídos por doubles nos testes isolados; a persistência real é verificada separadamente em PostgreSQL.

A web cobre o transporte por cookie, respostas 204, erros HTTP/rede, cadastro/login, recuperação de conexão e navegação acessível das abas. O mobile cobre SecureStore, transporte Bearer, erros, logout e aborto por timeout. Os doubles de rede/SecureStore ficam somente nos testes; nenhum mock foi adicionado à interface.

| Escopo | Aprovados / executados | Sucesso | Cobertura de linhas | Cobertura de ramos |
| --- | --- | --- | --- | --- |
| Backend somente unidade | 52 / 52 | 100% | 62,11% | 47,83% |
| Backend unidade + integração PostgreSQL | 60 / 60 | 100% | 88,20% | 71,74% |
| Web | 18 / 18 | 100% | 35,02% | 34,69% |
| Mobile | 12 / 12 | 100% | 16,66% | 8,91% |

Zero falhas e zero testes pulados em todas as execuções. São 82 casos unitários (52 + 18 + 12), além de 8 testes de integração do backend. A cobertura unitária do backend subiu de 45,34% para 62,11% das instruções/linhas executáveis. Com coleta de ramos habilitada, o indicador combinado de pytest-cov é 60,33% para unidade e 85,87% para unidade + integração; não deve ser confundido com cobertura de linhas.

O escopo do backend inclui todo `app`, inclusive seed e rotas não exercitados por unidades. A web inclui todo `src`, exceto `main.tsx` (bootstrap). O mobile inclui `App.tsx` e todo `src`. Arquivos sem testes permanecem no denominador. Ambos os clientes da API atingem 100% de cobertura de linhas, mas as telas nativas e parte das telas web ainda não têm cobertura. Não há percentual agregado do sistema nem validação mobile em dispositivo nesta entrega.

### Execução e CI

Em `backend/`:

```powershell
.venv/Scripts/python.exe -m pytest tests/unit -q --cov=app --cov-branch --cov-fail-under=60 --cov-report=xml:../artifacts/coverage/backend/unit.xml --junitxml=../artifacts/coverage/backend/unit-tests.xml
# Para a suíte completa, configure TEST_DATABASE_URL conforme README e execute:
.venv/Scripts/python.exe -m pytest -q --cov=app --cov-branch --cov-fail-under=85 --cov-report=xml:../artifacts/coverage/backend/full.xml --junitxml=../artifacts/coverage/backend/full-tests.xml
```

Em `web/` ou `mobile/`: `npm test` para unidades e `npm run test:coverage` para testes com cobertura. Vitest utiliza V8 conforme a [documentação oficial](https://vitest.dev/guide/coverage.html).

Os relatórios locais ficam em `artifacts/coverage/{backend,web,mobile}/` (ignorados pelo Git). O CI gera XML/JUnit e HTML no backend; JUnit, HTML, LCOV e JSON nos clientes. Publica artifacts `coverage-backend`, `coverage-web` e `coverage-mobile` e resumos com taxa de sucesso, cobertura de linhas e ramos usando `scripts/quality_summary.py`. O upload de relatórios também é tentado quando testes falham.

Pisos iniciais para impedir regressões: backend 60% em unidade e 85% na suíte completa (indicador combinado de instruções/ramos); web 30% de instruções/linhas/ramos e 20% de funções; mobile 10% de instruções/funções, 15% de linhas e 8% de ramos. Nos arquivos de transporte da API dos dois clientes, o piso é 100% de instruções/linhas/funções e 90% de ramos. Esses pisos refletem o estágio atual, não uma declaração de cobertura satisfatória de todo o produto. Próximas melhorias: ampliar testes das telas e dos fluxos esportivos e elevar gradualmente os pisos sem excluir arquivos para melhorar artificialmente os números.

## Atualização de qualidade: posts e perfis sociais — 10 de outubro de 2026

Para a entrega inicial de posts, foram ampliados os testes de integração PostgreSQL e adicionados testes de interface para os fluxos sociais. Backend: 79 aprovados e 1 teste de round-trip S3 real opcional pulado; cobertura da suíte completa: 86,13% combinada, 88,67% de linhas e 71,96% de ramos. Web: 24 aprovados, 39,83% de linhas e 31,84% de ramos. Mobile: 15 aprovados, 24,72% de linhas e 13,61% de ramos. Os pisos da suíte completa backend e dos clientes foram atendidos. A revisão posterior executou o piso unitário backend separadamente e encontrou 52,84%, abaixo de 60%; a correção está registrada a seguir.

Ruff, ESLint, TypeScript web/mobile, build web e exportação Android aprovados. Alembic check não detectou divergências após aplicar a migração `0003` no PostgreSQL local. Os testes de integração social substituem o armazenamento S3 por um double; round-trip de imagem de post no MinIO real, revisão visual ao vivo e execução do CI remoto continuam pendentes. Testes de interface e exportação Android não equivalem a validação em navegador/aparelho.

## Correções e regressões de posts — 10 de outubro de 2026

| Escopo | Aprovados / executados | Linhas | Ramos | Indicador combinado backend |
| --- | --- | --- | --- | --- |
| Backend unitário | 108 / 108 | 69,14% | 45,50% | 65,48% |
| Backend unidade + PostgreSQL + round-trip S3 | 130 / 130 | 89,77% | 75,23% | 87,52% |
| Web | 33 / 33 | 58,11% | 48,09% | — |
| Mobile | 20 / 20 | 46,03% | 29,86% | — |

Todos os pisos existentes foram atendidos, sem reduzi-los ou excluir arquivos. Unidades novas exercitam autorização, dados privados da fila administrativa, cursores, reenvios, auditoria e a distinção entre falha anterior/posterior ao commit do upload. Regressões de integração cobrem bloqueio recebido no feed, acesso revogado à imagem, denúncia privada, aprovação repetida, post preservado após falha de leitura, bloqueios além de 50 itens e reativação auditada sem restaurar sessões. Web testa digitação completa/foco, continuação de listas, sincronização de privacidade e reativação; mobile testa continuação de busca, galeria, comentários e relações.

Checks locais de Ruff, Alembic check, lint/tipos/build/cobertura web e lint/tipos/cobertura/exportação Android aprovados. Seis cenários adicionais em `artifacts/review-plans/` também passaram, incluindo avatares e posts na API com MinIO real em bucket isolado, removido após o ensaio. A conferência no navegador verificou dados existentes e layout em 320/390/1440 px; múltiplas páginas e decisões administrativas foram verificadas automaticamente. CI remoto e aparelhos permanecem sem validação nesta entrega.

## Etapa 3 (Jogar): indicadores — 12 de outubro de 2026

Verificação local da integração da etapa 3 (pareamento, partida, avulso, resultado e ranking), no backend e na web; o Expo não foi tocado e não foi reexecutado.

| Escopo | Aprovados / executados | Cobertura | Piso |
| --- | --- | --- | --- |
| Backend somente unidade (`pytest tests/unit -q --cov=app --cov-branch`) | 875 / 875 | 76% (indicador combinado de instruções e ramos: 9118 instruções, 1975 não cobertas; 1998 ramos, 78 parciais) | 60% |
| Backend suíte completa, com PostgreSQL | 1243 / 1244 (1 pulado: o round-trip S3 real) | 98% (112 instruções não cobertas; 56 ramos parciais) | 85% |
| Web (`npx vitest run --coverage --maxWorkers=4`) | 733 / 733 em 60 arquivos | 91,79% instruções, 85,01% ramos, 91,42% funções, 94,94% linhas | 30% (instruções, linhas e ramos) e 20% (funções) |

Ruff, `alembic check` (sem migração nova), ESLint e build da web (com o aviso de pacote acima de 500 kB: 1.157 kB minificado) aprovados. As suítes novas ou ampliadas cobrem as visões da partida (relato cego, `declared_slots` e `suggest_court`), a fila e o pareamento, o resultado e o ranking, e, na web, a placa, a tela da partida, o cartão de resultado, o Ranking, as notificações e filas e a navegação entre elas (`stage3-navigation.test.tsx`). Com a CPU disputada, alguns testes da web chegam perto dos 5 s: a execução usa `--maxWorkers=4`; nenhum teste foi desativado nem teve o limite alterado nesta entrega. Os pisos não foram reduzidos, nem arquivos excluídos para melhorar os números. Os testes não substituem a conferência no navegador (registrada em [situação da fundação](situacao-fundacao.md)), e o CI remoto continua sem execução comprovada desta versão.

## Etapas 4 e 5 (campeonatos e corrida): indicadores — 12 de outubro de 2026

Verificação local da integração das etapas 4 e 5 (chaveamento, agenda e decisão do organizador; corrida), no backend e na web; o Expo não foi tocado e não foi reexecutado.

| Escopo | Aprovados / executados | Cobertura | Piso |
| --- | --- | --- | --- |
| Backend somente unidade (`pytest tests/unit -q --cov=app --cov-branch`) | 1063 / 1063 | 76% (indicador combinado de instruções e ramos: 10710 instruções, 2374 não cobertas; 2374 ramos, 87 parciais) | 60% |
| Backend suíte completa, com PostgreSQL | 1519 / 1520 (1 pulado: o round-trip S3 real) | 98% (122 instruções não cobertas; 67 ramos parciais) | 85% |
| Web (`npx vitest run --coverage --maxWorkers=4`) | 898 / 898 em 72 arquivos | 92,39% instruções, 85,93% ramos, 91,92% funções, 95,45% linhas | 30% (instruções, linhas e ramos) e 20% (funções) |

Ruff, ESLint e build da web (com o aviso de pacote acima de 500 kB: 1.250 kB minificado) aprovados; não há migração nova nesta entrega. As suítes novas cobrem, no backend, as regras do chaveamento, da agenda, da decisão e da corrida (unidade e integração, inclusive com conexões reais para a ordem das travas) e, na web, o chaveamento e a árvore em SVG, as partidas e a folha de agenda, a decisão do organizador, a partida de campeonato, a gestão e o detalhe do evento com a tabela, a corrida (cronômetro, marcas, histórico) e a navegação entre elas (`stage4-navigation.test.tsx`, `run-marks.test.tsx`).

**Estabilidade dos testes da web:** um teste de navegação dependia de um título que só existe durante o carregamento (corrigido na raiz), e os fluxos longos passavam de 5 s com a máquina ocupada. O `vitest.config.ts` passou a ter `testTimeout` e `hookTimeout` de 20 s e `tests/setup.ts` (novo) fixa `asyncUtilTimeout` do Testing Library em 4 s; só falhas de verdade demoram mais para aparecer. Num teste de estresse (12 processos ocupando a CPU e 12 trabalhadores) a suíte falhava de 15 a 23 testes por tempo; com 24 processos ocupando a CPU, depois da mudança, duas execuções seguidas passaram sem falhas. Os pisos não foram reduzidos, nem arquivos excluídos para melhorar os números, e nenhum teste foi desativado. A verificação no navegador (fluxos reais de campeonato e de corrida) está em [`situacao-fundacao.md`](situacao-fundacao.md); CI remoto e aparelhos seguem sem validação.
