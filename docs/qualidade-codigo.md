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
