# Frontend web e protótipo ARENA

Referência: [Figma Make — Protótipo aplicativo ARENA](https://www.figma.com/make/JnbL2xvTf7xyhATwVbWcBm/Prototipo-aplicativo-ARENA), consultado em 9 de outubro de 2026. A cópia local do Make forneceu os arquivos `src/App.tsx` e `src/index.css` da revisão `5be4a30d063aec203523603b2f7c71fe2b4ae5c3`.

O cliente web reproduz o logo SVG, fontes Inter/Sora, verde `#005a36`, fundo `#e2e4e9`, texto `#495057`, cards, carrossel de modalidades, capa e avatar do perfil e navegação inferior com cinco destinos. Em telas maiores mantém o painel de 390 px do protótipo; até 430 px ocupa a tela e considera a área segura inferior.

A imagem usada pelo protótipo foi armazenada em `web/public/images/arena-cover.jpg`, sem substituição. Origem: `https://images.unsplash.com/photo-1668194645738-ef8dbb426086?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1080`. O logo é vetorial e os demais ícones usam Lucide, como a referência.

## Integração e limites

Cadastro, login, sessão, edição de nome, cidade, posição e disponibilidade continuam usando a API. A saudação, avatar e modalidades usam os dados da conta. As informações demonstrativas do Figma (pontuação, vitórias, partidas, seguidores, saldo, campeonatos e publicações) não são registros reais e não foram importadas. Essas áreas apresentam estados vazios ou indicação de disponibilidade futura. O botão Jogar leva à preparação dos perfis esportivos enquanto o agendamento de partidas não existe na API.

Esta revisão modifica o frontend web. O cliente Expo mantém a implementação anterior.

O usuário aprovou a interface atual em 9 de outubro de 2026 e esclareceu que não é necessário acrescentar mocks. Manter os dados reais e os estados vazios descritos acima. As próximas entregas devem atualizar a [situação da fundação](situacao-fundacao.md) com as alterações e integrações pendentes.

## Validação desta revisão

- Build de produção, TypeScript e ESLint aprovados; dependências web sem alertas no audit durante a instalação do Lucide.
- Cadastro e login de conta de teste executados no navegador.
- Perfil de futebol salvo em Brasília, posição meio de campo e procura de oportunidades; dados mantidos após recarregar.
- Alteração de nome confirmada pela API e refletida na saudação e no perfil.
- Navegação entre as cinco áreas, filtro de modalidade no ranking e abas do perfil verificados. As abas aceitam setas, Home e End e mantêm o foco no item selecionado.
- Layout conferido em 320, 390 e 1440 px, sem overflow horizontal da página. Rolagem interna e navegação inferior preservadas.

Capturas locais: `artifacts/arena-figma-home.jpg` e `artifacts/arena-figma-profile.jpg`. Os arquivos de evidência não são versionados.

## Ajuste de identidade solicitado em 9 de outubro de 2026

O usuário forneceu `Resumo Arena.html` como referência dos símbolos. Sete SVGs locais em `web/public/images/brand/` preservam os desenhos: Coliseu em ruínas para a marca e navegação de ranking, parede alta para o botão central e cinco elos com as cores originais. A marca textual segue a solicitação explícita `arena.` em minúsculas, com ponto verde. As demais propostas e decisões em aberto do HTML não foram tratadas como instruções de implementação.

Moedas, carteira e seus acessos foram removidos da web. A sequência visual de elos não simula classificação, saldo nem resultados. Build, TypeScript e ESLint passaram; ilustrações e navegação foram conferidas no navegador, junto ao perfil sem carteira.

Os ícones de modalidades foram posteriormente substituídos pelos três PNGs enviados pelo usuário, de forma provisória. A troca foi centralizada no componente `SportIcon`, incluindo home, preparação esportiva, filtros e chips, sem modificar a marca nem os SVGs de elo.
