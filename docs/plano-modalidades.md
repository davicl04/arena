# Plano — tela de modalidades, cidade por localização e catálogo nacional de municípios (web + Expo)

> Estado: **implementado em 22 de novembro de 2026**, na web, no Expo e no backend, com as limitações listadas em [Implementação](#implementação). As decisões técnicas estão na [decisão 0005](decisoes/0005-catalogo-municipios.md), e as verificações, na [situação da fundação](situacao-fundacao.md). O MVP completo continua não implementado.

## Contexto

> Esta seção descreve o estado **antes** da implementação. Os `SportCard` citados foram removidos: a web usa agora [`components/sports-profile/`](../web/src/components/sports-profile/), e o Expo, [`components/sports-profile/`](../mobile/src/components/sports-profile/).

A tela "Suas modalidades" é onde a pessoa cria e edita os perfis esportivos. Conta nova chega a ela pelo cartão "Complete seu perfil esportivo" do Início, pelo botão Jogar ("Preparar perfil") e pelo Ranking. Quem já tem perfil chega pelo perfil e pelas configurações.

- **Web:** a tela `sports` em [ArenaPage.tsx](../web/src/pages/ArenaPage.tsx) empilhava três `SportCard.tsx` (`web/src/components/`, removido). Cada cartão tinha uma ficha (Cidade, Nível, Disponibilidade, Posição) e um formulário com `select` nativos e uma caixa de seleção.
- **Expo:** a mesma estrutura, em `SportCard.tsx` (`mobile/src/components/`, removido) dentro de [ProfileScreen.tsx](../mobile/src/screens/ProfileScreen.tsx).
- **Cidades:** o catálogo tinha só 6 municípios ([decisão 0001](decisoes/0001-fundacao.md#cidades)). `GET /cities` devolvia no máximo 100 itens em ordem alfabética, com filtro `ilike` só pelo nome. Os dois clientes carregavam essa lista uma única vez e a usavam para nomear e escolher cidades em Jogar, Eventos, Times, Assistente de evento, Pedido de organizador e no perfil esportivo.
- **"Procurando oportunidades"** (`looking_for`) só é gravado e exibido: nenhuma busca, convite ou descoberta usa esse dado.

## Decisões da sessão de protótipos

As decisões saíram do grilling de protótipos de 22 de novembro de 2026. A fonte local é `artifacts/prototipos/modalidades.html`, fora do versionamento. Abra-a por um servidor HTTP local, porque as máscaras dos ícones não carregam via `file://`. Ela mostra o fluxo final completo, com um seletor de estados (conta nova, futebol ativo, todas), permissão de localização (sem permissão, concedida, negada), tema e largura.

| Parte | Decisão |
| --- | --- |
| Tela | **Faixas.** Título "Onde você joga?", contador "n de 3 ativas" e uma faixa de 132 px por modalidade. A faixa inativa usa superfície do tema e o selo "Toque para ativar". A ativa usa degradê verde-floresta, o selo menta "● Ativa" e o resumo do perfil. O aviso de privacidade continua no fim. |
| Edição | **Folha inferior, uma pergunta por vez,** com barra de progresso. Futebol: Cidade → Posição → Revisão. Tênis e corrida: Cidade → Revisão. |
| Cidade | **Sem permissão decidida:** botão "Usar minha localização", divisor "ou" e busca. **Permissão concedida (agora ou antes):** confirmação "Pela sua localização: Brasília · DF", com "Não, escolher outra cidade". **Permissão negada ou falha:** aviso e busca. |
| Posição | **Lista de rádio com descrição:** Goleiro ("Defende a meta"), Defesa ("Segura a linha de trás"), Meio de campo ("Arma as jogadas"), Atacante ("Busca o gol") e "Ainda não sei". |
| Disponibilidade | **Passo de revisão.** Linhas Cidade e Posição com "Alterar". Chave "Procurando oportunidades", com o texto "Aparece no seu perfil esportivo." e começando desligada. Botão "Ativar futebol" (ou "Salvar" ao editar). |
| Conclusão | A folha fecha, a faixa fica ativa e aparece o **`toast.success` do projeto**: "Futebol ativado." para perfil novo ou "Perfil salvo." ao editar, com o resumo como descrição. |
| Catálogo | **Todos os municípios** (5.570 no planejamento; 5.571 implementados, ver abaixo), do conjunto [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (licença MIT, código IBGE de 7 dígitos, latitude e longitude da sede). Os IDs atuais continuam válidos. |
| Escopo | **Web e Expo, nesta entrega.** |

Exploradas e descartadas: Assistente, Abas, Ajustes e Cartas, como layouts gerais. Mosaico, Coliseu, Separadas e Placar, como cabeçalho e faixas. Grade, Rádio, Atalho e Por região, para escolher a cidade. Campinho, Cartões e Formação, para a posição. Tela de sucesso, sugestão da próxima modalidade e destaque na faixa, para a conclusão.

## Cidade sugerida pela localização

- **Cliente:** o pedido de permissão só acontece quando a pessoa toca em "Usar minha localização". A precisão é baixa. As coordenadas são arredondadas para 2 casas decimais. A web usa `navigator.geolocation`, e localhost conta como contexto seguro. O Expo usa a nova dependência `expo-location`, com permissão aproximada em primeiro plano.
- **Servidor:** `POST /cities/nearest`, autenticado, recebe `{ latitude, longitude }` **no corpo**, e não na URL, para que as coordenadas não caiam em logs de acesso. Devolve a sede de município mais próxima pelo catálogo local. Se ela estiver a mais de 100 km, devolve 404 ("fora da cobertura"). As coordenadas não são gravadas, registradas nem ecoadas. Nenhum serviço externo de geocodificação é usado.
- **Limitação aceita:** a sede mais próxima nem sempre é o município em que a pessoa está, principalmente perto de divisas. Por isso a cidade é só uma sugestão, e a pessoa pode trocar.

## Catálogo nacional e efeitos nos clientes

- **Migração Alembic nova:** acrescenta `latitude`, `longitude`, `capital` e uma coluna de busca normalizada (nome + UF, sem acento e em minúsculas). Insere os municípios ausentes e atualiza os 6 atuais sem mudar ID, nome ou UF. Os dados vêm de um arquivo versionado, junto com a licença MIT. A migração não baixa nada.
- **Downgrade:** remove as colunas e apaga só os municípios novos que não estão referenciados. Se algum estiver em uso, falha com mensagem explícita.
- **`GET /cities?q=`:** busca por nome e UF, ignorando acento e caixa, com mínimo de 2 caracteres e no máximo 20 resultados. UF exata tem prioridade.
- **`GET /cities?ids=`:** nomeia cidades já salvas.
- **`ProfileOut.city`:** o perfil esportivo passa a trazer o objeto da cidade, numa mudança aditiva.
- **Fim da lista global:** os clientes deixam de carregar a lista de cidades. Para nomear, usam o objeto `city` que as respostas já trazem: perfil, time, evento, partida e pedido de organizador. Para escolher, usam a busca do servidor. O `CitySheet` da web e os seletores equivalentes do Expo passam a usar a busca.

## Ordem sugerida

1. Dados, migração, serviço e rotas de cidades, e `ProfileOut.city`.
2. Web: remoção da lista global e seletores de cidade com busca.
3. Web: nova tela de modalidades e a folha passo a passo.
4. Expo: remoção da lista global e seletores de cidade com busca.
5. Expo: nova tela, folha e `expo-location`.
6. Documentação: [decisão 0005](decisoes/0005-catalogo-municipios.md) sobre o catálogo nacional (fonte, licença, cidade sugerida, privacidade das coordenadas e efeito no pareamento), ajuste da seção "Cidades" da 0001, documentação da API e situação da fundação.

## Validação prevista

- **Backend:** integração HTTP com PostgreSQL cobrindo a contagem do catálogo e os 6 IDs preservados; a busca sem acento, por UF, com limite e com `q` curto; `ids=`; a cidade mais próxima (Brasília → 5300108, Goiânia → 5208707); 404 fora da cobertura, 422 com coordenadas inválidas e 401 sem sessão; e `ProfileOut.city`. Também `ruff`, `pytest`, `alembic check`, upgrade e downgrade.
- **Web:** testes de página com geolocalização e permissão simuladas (não decidida, concedida, negada, erro e 404), passos por modalidade, revisão, payload do `PUT`, toasts e seletores de Times e Evento. Também `lint`, `build`, `test:coverage` e o fluxo real no navegador nos dois temas, em 320, 390 e 1440 px.
- **Expo:** `expo-location` simulado nos mesmos estados. Também `lint`, `typecheck`, `test:coverage`, `export:android` e `npx expo install --check`. O build não comprova o funcionamento em aparelho.

## Questões em aberto (não bloqueiam)

- Ao editar um perfil existente, abrir no passo 1 (como no protótipo) ou direto na revisão? Recomendação: direto na revisão. **Implementado:** abre no passo 1 com os valores atuais, até decisão do usuário.
- Com o catálogo nacional, o pareamento por cidade terá menos gente por município fora das capitais. Agrupar por região fica para uma entrega futura, se for necessário.
- O limite de cobertura (100 km) e o arredondamento (2 casas) são valores iniciais.

## Implementação

Entregue em nove tickets: catálogo e busca (01), cidade mais próxima (02), web sem lista global (03), tela da web (04), localização na web (05), Expo sem lista global (06), tela do Expo (07), localização no Expo (08) e contrato final com documentação (09). O registro de cada um, com as verificações executadas, está na [situação da fundação](situacao-fundacao.md).

- **Catálogo:** 5.571 municípios, e não 5.570. O commit fixado da origem (`503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861`) já inclui Boa Esperança do Norte (MT, 5101837), instalado em 2025, e o usuário decidiu mantê-lo. Fonte, licença e transformação estão em [FONTE.md](../backend/migrations/data/municipios/FONTE.md).
- **Contrato:** `GET /cities` sem parâmetros devolve os seis municípios originais para clientes antigos. Enviar `q` e `ids` juntos devolve 422. Os detalhes estão na [decisão 0005](decisoes/0005-catalogo-municipios.md#3-contrato-da-api).
- **Web:** faixas e folha em [`web/src/components/sports-profile/`](../web/src/components/sports-profile/); seletores de cidade com [`CitySearch`](../web/src/components/cities/CitySearch.tsx).
- **Expo:** faixas e folha em [`mobile/src/components/sports-profile/`](../mobile/src/components/sports-profile/); seletores de cidade em [`CitySearch.tsx`](../mobile/src/components/arena/CitySearch.tsx); nova dependência `expo-location`.

### Limitações reais

- **Expo sem verificação em aparelho:** não houve aparelho nem emulador. A tela do Expo não foi conferida visualmente, e a paridade visual com a web não foi verificada.
- **Permissão e GPS reais não verificados:** o diálogo nativo de permissão (Android/iOS) e o GPS real não foram testados, nem o Android com `ACCESS_FINE_LOCATION` bloqueado. Na web, o fluxo foi conferido no Chromium com geolocalização simulada pelo Playwright; o pedido real do navegador e o leitor de tela também não foram verificados.
- **Sem Sora no Expo:** o nome da cidade sugerida usa a fonte do sistema, porque o Expo não carrega Sora.
- **Sem arrastar para fechar:** a folha não fecha por arraste em nenhum dos clientes. Na web, fecha pelo X, por Esc ou por toque fora; no Expo, pelo voltar do Android ou por toque fora.
- **Texto do toast:** é literal, `<Modalidade> ativado.` ("Futebol ativado.", "Tênis ativado." e também "Corrida ativado."). O usuário ainda não decidiu sobre a forma "Corrida ativada.".
- **Edição no passo 1:** a questão Q1 foi mantida como passo 1, conforme a spec.
- **Sem nova tentativa de localização** na mesma folha depois de falha ou 404; resta a busca.
- **Diagramas:** `docs/diagramas/banco-*.png` continuam na revisão 0014.

## Fora do escopo

Geocodificação externa ou mapa real; uso de `looking_for` em buscas; regiões administrativas do DF; mudança na regra de pareamento; o atalho "mesma cidade de outra modalidade"; apagar um perfil esportivo; e moedas, elo ou pontos nesta tela.
