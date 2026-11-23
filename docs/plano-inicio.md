# Plano: nova tela de Início (web + Expo)

> Estado: **implementado em 22 de novembro de 2026, na web e no Expo**, no mesmo dia em que foi planejado. O que foi entregue e as limitações reais estão em [Implementação](#implementação--22-de-novembro-de-2026), no fim deste plano. A especificação de trabalho fica em `.scratch/inicio/spec.md`, que não é versionado. O registro de cada entrega fica na [situação da fundação](situacao-fundacao.md). O MVP completo continua não implementado.

## Contexto

Estado **antes** desta entrega:

- **Web (`HomePage`):** a tela empilhava, nesta ordem:
  - a saudação "Bora jogar, {nome}?";
  - a placa escura "Para responder";
  - o carrossel "Seu elo", com cartões grandes e uma barra de progresso sempre vazia;
  - o botão "Encontrar partida";
  - a seção "Próxima partida";
  - a foto "Perto de você / Sua próxima arena", com o texto fixo "Novas atividades em breve";
  - o cartão "Seu próximo passo".
- **Expo (`HomeScreen`):** a mesma base, com um subtítulo próprio e, no fim, os grupos de atalhos JOGAR (Meus times, Campeonatos, Provas de corrida), ORGANIZADOR e ADMINISTRAÇÃO.
- **Atalhos duplicados:** os destinos desses grupos já existem nas duas plataformas, no Jogar ("Outras formas de jogar") e no menu do Perfil.
- **Campeonatos:** a API já lista campeonatos por modalidade e cidade (`GET /events?sport=&city_id=`), mas o Início não usava essa leitura.

## Decisões da sessão de protótipos

As decisões saíram do grilling de protótipos de 22 de novembro de 2026, em seis rodadas.

**Protótipo de referência:** `artifacts/prototipos/inicio.html`, fora do versionamento. Abra-o por um servidor HTTP local, porque as máscaras não carregam via `file://`. Ele mostra a versão consolidada, com seletor de estado (Completo, Sem pendências, Tênis individual e Conta nova), tema e largura.

| Parte | Decisão |
| --- | --- |
| Estrutura | O **Placar** (próxima partida) é o bloco principal, e os elos usam as pílulas do "cartão do atleta". |
| Saudação | Data por extenso e **"A arena te chama, {primeiro nome}"**, sem pontuação final. |
| Placar | **Contagem** em números grandes, que muda de formato conforme a partida se aproxima: "3 dias 4 h", depois "5 h 20 min", depois "40 min". Abaixo vem a data e a hora; no rodapé do bloco, a linha do confronto, que abre a partida. Em partida individual aparece "Você × {adversário}". Sem partida: "—" e "Nenhuma partida agendada". Bloco escuro por design. |
| Botão | "Encontrar partida", "Encontrar outra partida" (com partida agendada) ou "Preparar perfis" (sem perfis). Sempre leva ao Jogar. |
| Para responder | **Destaque.** A pendência mais urgente aparece em cartão claro, com "Mais urgente" ou "Aguardando você", o prazo e "Responder". O toque abre o aviso, como antes. Embaixo, "+ n pendências · ver todas". A placa some sem pendências. |
| Seu elo | **Pílulas** num bloco escuro: ícone, modalidade, elo e métrica. Sem classificação aparece "n de 3", "Sem marca" ou "Sem perfil", nunca um elo. |
| Rodapé | **Campeonatos** das cidades dos perfis esportivos: uma leitura por perfil, juntando por data, com os 2 primeiros exibidos. O título é "Campeonatos em {cidade}" ou, com cidades diferentes, "Campeonatos perto de você". Há estados vazio, sem perfis e de erro. "Complete seu perfil esportivo" continua aparecendo enquanto faltar modalidade. |
| Paridade | Web e Expo ficam **iguais**. O Expo perde os grupos de atalhos, que continuam acessíveis pelo Jogar e pelo menu do Perfil. |

Exploradas e descartadas:
- **Layouts gerais:** Vestiário (grade 2×2), Agenda (linha do tempo), Coliseu (topo imersivo) e Atleta (cartão de identidade com atalhos).
- **Combinações de Placar e elos:** cartão + Placar, faixa única, atleta claro e cartão único.
- **Formatos do Placar:** Confronto, Placar eletrônico, Ingresso e Placar com ações.
- **Formatos dos elos:** Emblemas, Linhas com posição no ranking, Cores do elo e Carrossel.
- **Formatos das pendências:** Placa escura, Lista clara, Faixa no topo e Cartões deslizáveis.
- **Rodapés:** Como hoje, Cartaz com foto, Cartazes deslizáveis e Enxuto.

## Dados e contratos

- **Sem mudança de backend, contrato ou migração.**
- **Placar:** usa a próxima partida agendada entre as partidas da placa do Jogar (`GET /me/play`), já lidas pelo shell.
- **Destaque:** usa o resumo das notificações (`pending_count`) e a lista de pendências, que já vem ordenada por urgência. Basta pedir 1 item.
- **Pílulas:** usam `GET /me/standings`, pela regra existente de `modalityStanding`.
- **Campeonatos:** usam `GET /events?sport={modalidade}&city_id={cidade do perfil}`, uma chamada por perfil esportivo. Os resultados são unidos, sem duplicatas, ordenados por `starts_at`, e os 2 primeiros são exibidos. As etiquetas vêm do próprio cartão do evento: preço, vagas, `eligibility.eligible` e estado.

## Ordem sugerida

1. Lógica pura nos dois clientes: contagem, rótulos, união dos campeonatos, títulos e urgência, com testes.
2. Placar, botão e saudação: web e Expo.
3. Destaque das pendências: web e Expo.
4. Pílulas de elo: web e Expo.
5. Campeonatos e cartão de próximo passo: web e Expo.
6. Remoção dos atalhos do Expo e do que ficar sem uso; documentação e verificações finais.

## Limitações conhecidas

- O Expo não tem desfoque nem a mesma biblioteca de ícones. As marcas d'água e os ícones usam os recursos já existentes no Expo. Sem validação em aparelho, não se declara paridade visual do Expo.
- Os campeonatos de várias cidades exigem uma chamada por perfil (até 3). Uma rota agregada fica fora do escopo.
- O progresso até o próximo elo não existe na API e não é exibido.

## Implementação — 22 de novembro de 2026

O plano foi entregue em nove tickets: quatro na web (01 a 04), quatro no Expo (05 a 08) e o fechamento (09), com a conferência de paridade e as verificações finais. O registro de cada ticket, com as verificações executadas, está na [situação da fundação](situacao-fundacao.md).

**Onde está:**
- Web: [`HomePage.tsx`](../web/src/pages/HomePage.tsx), os componentes `Placar`, `Destaque`, `Pilulas`, `ProximoPasso` e `Campeonatos` em [`web/src/components/home/`](../web/src/components/home/) e as regras puras em [`web/src/data/home.ts`](../web/src/data/home.ts).
- Expo: [`HomeScreen.tsx`](../mobile/src/screens/HomeScreen.tsx), os mesmos componentes em [`mobile/src/components/home/`](../mobile/src/components/home/) e as regras em [`mobile/src/data/home.ts`](../mobile/src/data/home.ts).
- As duas implementações de `data/home.ts` têm as mesmas funções, com os mesmos nomes e textos. Mudar uma regra num cliente exige mudar no outro.

**O que mudou na tela, nos dois clientes:**
- Ordem: marca e sino; data e "A arena te chama, {primeiro nome}"; Placar; botão principal; Destaque (só com pendências); Seu elo; Seu próximo passo (só enquanto falta modalidade); Campeonatos.
- Saíram a saudação "Bora jogar, {nome}?", o subtítulo do Expo, a seção "Próxima partida", o carrossel de cartões de modalidade, a barra de progresso vazia, a foto "Perto de você / Sua próxima arena" e, no Expo, os grupos JOGAR, ORGANIZADOR e ADMINISTRAÇÃO. Os destinos desses grupos continuam no Jogar ("Outras formas de jogar") e no menu do Perfil.
- Ficaram sem uso e foram removidos: `PendingPlate` (web e Expo), `pendingTitle` (web) e `ModalityCard` (Expo).
- Leituras: a única nova é `GET /events?sport=&city_id=&limit=2`, uma por perfil esportivo, em paralelo e uma vez por montagem da tela. As pendências passaram a pedir 1 item (`?limit=1`). No Expo, o Início lê `GET /me/sports-profiles` uma vez, porque o shell não lê essa rota. Na web, os perfis vêm do shell.
- Sem mudança de backend, contrato, migração ou dependência.

**Diferenças mantidas entre os clientes ou em relação ao protótipo:**
- O título do cartão do Destaque usa o rótulo da pendência em caixa alta, nos dois clientes. O protótipo usa caixa de frase.
- Os formatos do prazo e da linha secundária do Destaque são os formatadores que cada cliente já tinha: "1 d 23 h" e "society 7" na web; "1 dia 23 h" e "society 7×7" no Expo. Com o prazo vencido, a web mostra "faltam menos de 1 min" e o Expo mostra "prazo encerrado".
- "Você pode se inscrever" não aparece em campeonato em andamento, nos dois clientes. A elegibilidade da API considera só o elo, e o evento em andamento já não recebe inscrição. É uma leitura da implementação sobre o texto da spec, a confirmar na revisão.
- Quando a leitura dos perfis falha, os Campeonatos da web mostram uma nota, e o erro com a nova tentativa fica no aviso do shell, que é quem lê os perfis. No Expo, o próprio Início lê os perfis, e o erro aparece na seção, com "Tentar novamente".
- As etiquetas de preço e de vagas seguem o formato dos cartazes de campeonato ("R$ 40", "8 de 16 times"), e não o do protótipo ("R$ 40 por time", "8 de 16 vagas").
- O nome acessível do Placar fala a contagem por extenso na web ("3 dias e 4 horas") e na forma curta no Expo ("3 dias 4 h"). Os dois incluem a contagem, o confronto, a data e o local.
- Na web, a lista de pendências do Início só é lida quando o resumo indica pendências. No Expo, ela é lida a cada montagem, com 1 item, e o Destaque só aparece quando o resumo indica pendências.

**Limitações:**
- Sem validação em aparelho Android ou iOS. Não se declara paridade visual do Expo com a web. O build do Expo não comprova funcionamento em aparelho.
- No Expo, a marca d'água do Placar fica centralizada, porque reaproveita a placa `TeamsPlate`. Nas Pílulas, fica no canto, como no protótipo.
- O banco de desenvolvimento não tem campeonato publicado, porque publicar exige um organizador aprovado por um administrador. Na web, as linhas de campeonato foram conferidas com a resposta de `/events` simulada só no navegador, além dos testes. Não há dado fictício no código.
- A troca do Placar para a partida seguinte acompanha o relógio de 60 s e pode atrasar até um minuto.
- Os campeonatos de várias cidades exigem uma chamada por perfil (até 3). O progresso até o próximo elo não existe na API e não é exibido.
