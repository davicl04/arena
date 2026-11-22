# Plano: nova tela de Início (web + Expo)

> Estado: **planejado em 22 de novembro de 2026, ainda não implementado.** A especificação de trabalho fica em `.scratch/inicio/spec.md`, que não é versionado. O registro de cada entrega fica na [situação da fundação](situacao-fundacao.md). O MVP completo continua não implementado.

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
