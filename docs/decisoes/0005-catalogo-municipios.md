# Decisões — Catálogo nacional de municípios e cidade sugerida

Data: 22 de novembro de 2026. Implementa o [plano de modalidades](../plano-modalidades.md) no backend, na web e no Expo e substitui o catálogo inicial de 6 cidades da [decisão 0001](0001-fundacao.md#cidades). Os IDs continuam sendo os códigos IBGE de 7 dígitos, e os perfis esportivos continuam privados.

## 1. Catálogo nacional

- **Fonte:** [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros), no commit fixado `503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861` (10 de dezembro de 2025). Foram usados `csv/municipios.csv` e `csv/estados.csv`, que fornecem o código IBGE, o nome, a UF, a latitude e a longitude da sede e o indicador de capital.
- **Licença MIT e atribuição:** o arquivo derivado fica em [`backend/migrations/data/municipios/`](../../backend/migrations/data/municipios/). A licença original está em [LICENSE](../../backend/migrations/data/municipios/LICENSE), copiada sem alterações. A origem, os SHA-256 e a transformação estão em [FONTE.md](../../backend/migrations/data/municipios/FONTE.md).
- **5.571 municípios, e não 5.570:** o commit fixado já inclui Boa Esperança do Norte (MT, 5101837), município instalado em 2025. O commit anterior da origem tinha 5.570. O usuário decidiu em 22 de novembro de 2026 manter os 5.571. O catálogo tem 27 capitais.
- **Migração `0015_national_city_catalog.py`:**
  - acrescenta a `cities` as colunas `latitude` e `longitude` (não nulas), `capital` e `search_text` (nome + UF normalizados, não nula), com o índice `ix_cities_search_text`;
  - insere os municípios ausentes;
  - as 6 cidades da 0001 (5300108, 3550308, 3304557, 2304400, 3106200 e 5208707) mantêm ID, nome e UF e só recebem as colunas novas. Perfis, times, eventos, partidas e quadras ligados a elas não mudam;
  - se alguma cidade existente não estiver no arquivo, a migração falha sem alterar nada.
- **Sem rede:** a migração lê só o arquivo versionado. A API não consulta o IBGE nem outro serviço em tempo de execução.
- **Atualizações:** o arquivo pertence à 0015 e não muda depois de aplicado. Um catálogo novo exige um arquivo novo, lido por uma migração nova, com a origem registrada ao lado.

## 2. Normalização e busca

- **Uma única normalização,** em Python: `normalize_search_text` e `city_search_text`, em [`backend/app/services/cities.py`](../../backend/app/services/cities.py). A migração grava `search_text` com elas, e a busca normaliza o termo digitado com a mesma função.
  - A função remove acentos (NFKD), passa para minúsculas, apaga apóstrofos ("D'Oeste" vira "doeste") e troca qualquer outra pontuação por um espaço.
  - Mudar a função exige uma migração que recalcule a coluna.
- **Sem extensão do PostgreSQL** (`unaccent`, `pg_trgm`): a normalização acontece antes de gravar e antes de consultar.
- **Índice:** btree com `text_pattern_ops` em `search_text`, que serve à comparação por prefixo. A ocorrência interna percorre a tabela, o que é aceitável com 5.571 linhas: a mediana medida no banco de desenvolvimento ficou entre 3,3 e 4,7 ms.
- **Ordem:** correspondência exata da UF primeiro, seguida de prefixo do nome e ocorrência interna. Dentro de cada grupo, capitais aparecem primeiro, seguidas da ordem alfabética pelo nome normalizado, pela UF e pelo ID. A resposta tem no máximo 20 cidades.

## 3. Contrato da API

As descrições públicas ficam em [`backend/app/core/openapi.py`](../../backend/app/core/openapi.py) e aparecem em `/docs` e `/openapi.json`.

| Operação | Contrato |
| --- | --- |
| `GET /api/v1/cities?q=` | Público. `q` com 2 ou mais caracteres, depois de normalizado, busca por nome e UF, sem diferenciar acentos e maiúsculas ("goiania", "sao paulo sp", "df"). Devolve até 20 `CityOut` (`id`, `name`, `state`). Com menos de 2 caracteres, devolve `[]`. |
| `GET /api/v1/cities?ids=` | Público. Recebe até 50 IDs distintos, separados por vírgula, e devolve os municípios existentes em ordem alfabética. IDs inexistentes e repetidos são ignorados. Valor não numérico ou 51 ou mais IDs devolvem 422. |
| `GET /api/v1/cities` sem `q` nem `ids` | Devolve os seis municípios do catálogo original, em ordem alfabética, para clientes antigos (ver a seção 7). |
| `q` e `ids` juntos | 422. |
| `POST /api/v1/cities/nearest` | Exige sessão: cookie com `Origin` autorizado na web ou Bearer no Expo. O corpo JSON é `{ "latitude": número, "longitude": número }`, com faixas de −90 a 90 e de −180 a 180. Texto, booleano, `null`, NaN, Infinity, campo ausente ou campo extra devolvem 422, sem ecoar o valor. Devolve o `CityOut` da sede mais próxima, ou 404 com "Não encontramos um município perto de você." quando ela está a mais de 100 km. Sem sessão, 401. `GET` responde 405. |
| `ProfileOut.city` | `GET /api/v1/me/sports-profiles` e a resposta do `PUT /api/v1/me/sports-profiles/{sport}` trazem `city: CityOut` além de `city_id`. A mudança é aditiva; o `PUT` continua recebendo só `city_id`, `position` e `looking_for`. |

Os clientes nomeiam cidades pelo objeto `city` que as respostas de perfil, time, evento, partida e pedido de organizador já trazem. Na falta dele, o Expo consulta `ids=`. Para escolher uma cidade, os clientes usam a busca.

## 4. Cidade sugerida

- `POST /cities/nearest` calcula, **em memória no servidor**, a distância de haversine (raio médio da Terra de 6.371,0088 km) do ponto até a sede de cada um dos 5.571 municípios. Devolve a sede mais próxima; em caso de empate, o menor código IBGE.
  - O cálculo em memória foi preferido a uma consulta geográfica: nenhum valor derivado da localização chega ao SQL, onde poderia aparecer em logs do PostgreSQL. Também não há índice novo nem cache.
  - A mediana medida foi de cerca de 5 ms, tanto no serviço quanto por HTTP no uvicorn.
- **Limite de 100 km:** além disso, a resposta é 404 ("fora da cobertura": oceano ou exterior). É um valor inicial (questão Q3 da spec), ajustável depois da verificação real, na constante `NEAREST_MAX_DISTANCE_KM`.
- **Arredondamento nos clientes:** a web e o Expo arredondam latitude e longitude para 2 casas decimais (cerca de 1 km) antes de enviar. O servidor não depende disso; ele não grava o valor recebido.
- A pessoa confirma a cidade sugerida ou escolhe outra pela busca. Se escolher uma cidade enquanto a localização ainda carrega, a resposta fica disponível como sugestão e a escolha manual prevalece.

## 5. Privacidade das coordenadas

- As coordenadas trafegam **só no corpo** do `POST`, nunca na URL ou na query. Assim, não aparecem no log de acesso, que registra apenas o caminho.
- Não são gravadas no banco, não são registradas em log, não voltam na resposta nem nas mensagens de erro. O tratador global de validação omite o valor recebido.
- Não há geocodificação externa nem mapa: a sugestão usa só o catálogo local.
- A web não grava a posição no navegador (nem `localStorage`, nem `sessionStorage`), e o Expo não a grava no aparelho.
- A cidade continua parte do perfil esportivo privado; nada passa a ser público.

## 6. Permissões

- **Pedido só por toque:** o pedido de permissão acontece apenas quando a pessoa toca em "Usar minha localização", nunca ao abrir a tela. Se a permissão já foi concedida antes e o perfil é novo, a sugestão é obtida automaticamente ao entrar no passo da cidade.
- **Web:** o estado vem da Permissions API (`navigator.permissions.query({ name: 'geolocation' })`). Sem ela, ou se ela falhar, a permissão é tratada como não decidida.
  - A leitura usa `navigator.geolocation.getCurrentPosition` com `enableHighAccuracy: false`, `maximumAge` de 5 minutos e tempo limite de 10 s.
  - Sem geolocalização ou fora de contexto seguro, o toque leva ao aviso de falha e à busca. `localhost` conta como contexto seguro.
- **Expo:** usa `expo-location` (~57.0.23), apenas com permissão em primeiro plano.
  - O estado é lido por `getForegroundPermissionsAsync`, e o pedido é feito por `requestForegroundPermissionsAsync`.
  - A posição usa a última conhecida (até 5 minutos) ou `Accuracy.Low`, com tempo limite de 10 s.
  - O `app.json` traz o texto de propósito em português para o uso durante o app e desliga os pedidos de "sempre", de segundo plano e de movimento.
  - No iOS, `NSLocationDefaultAccuracyReduced` pede localização aproximada.
  - No Android, `ACCESS_FINE_LOCATION` e `ACCESS_BACKGROUND_LOCATION` ficam em `blockedPermissions`, e o manifesto gerado declara só `ACCESS_COARSE_LOCATION` entre as permissões de localização, conforme a introspecção da configuração do Expo no ticket 08.
  - O diálogo nativo, o GPS real e o comportamento do Android com FINE bloqueado **não foram verificados em aparelho**.

## 7. Ampliação e compatibilidade do contrato

A migração dos clientes e o suporte a versões instaladas seguiram três etapas.

1. **Ampliação (ticket 01):** o backend ganha o catálogo nacional, `q` normalizado, `ids=`, `ProfileOut.city` e, no ticket 02, `POST /cities/nearest`. `GET /cities` sem `q` mantém as 100 primeiras cidades por nome.
2. **Migração dos clientes (tickets 03 e 06):** a web e o Expo deixam de carregar a lista global e passam a usar `city` nas respostas, a busca e, no Expo, `ids=`. A ausência de chamadas à lista global foi comprovada por busca no código dos dois clientes.
3. **Compatibilidade:** `GET /cities` sem parâmetros devolve somente os seis municípios originais. Isso preserva o funcionamento dos seletores em clientes anteriores à busca nacional.

## 8. Consequências

- **Pareamento por cidade (Q2):** a regra de pareamento continua sendo a mesma `city_id`. Com 5.571 municípios, haverá menos pessoas por município fora das capitais e das grandes cidades, e regiões metropolitanas ficam divididas (Aparecida de Goiânia não pareia com Goiânia). Um agrupamento regional fica para uma entrega futura, se for necessário.
- **Sede, e não território:** a sugestão escolhe a sede mais próxima, e não o município em que o ponto está. Perto de divisas, ou em municípios extensos, a sugestão pode ser o vizinho. Por isso é sempre editável.
- **DF:** continua um único município (Brasília); regiões administrativas, bairros e distritos estão fora do escopo.
- **Inserções futuras** em `cities` precisam preencher `search_text` com `city_search_text`.

## 9. Reversão

- **Esquema (downgrade da 0015 para a 0014):**
  - trava `cities` em modo `EXCLUSIVE` e procura, em todas as chaves estrangeiras para `cities`, IDs fora das 6 cidades originais;
  - se encontrar algum, falha com mensagem explícita listando a tabela, a coluna e os IDs, sem apagar nada;
  - caso contrário, apaga os municípios novos e remove o índice e as colunas `search_text`, `capital`, `longitude` e `latitude`, voltando às 6 cidades e às colunas originais.
- **Código:** a API desde o ticket 01 mapeia as colunas novas, e os clientes desde os tickets 03 e 06 dependem da busca e de `ProfileOut.city`. Reverter o esquema exige reverter também a API e os clientes ao estado anterior a esta entrega.

## Pendências

- Verificação em aparelho Android/iOS: diálogo nativo de permissão, GPS real e manifesto com FINE bloqueado.
- Ajuste do limite de 100 km e do arredondamento de 2 casas depois de uso real (Q3).
- Agrupamento regional do pareamento, se necessário (Q2).
- Os diagramas `docs/diagramas/banco-*.png` ainda mostram a revisão 0014 e precisam ser gerados de novo. O diagrama Mermaid de [fundacao.md](../diagramas/fundacao.md) já mostra as colunas novas de `cities`.
