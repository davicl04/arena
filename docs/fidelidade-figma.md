# Frontend web e protótipo ARENA

Referência: [Figma Make — Protótipo aplicativo ARENA](https://www.figma.com/make/JnbL2xvTf7xyhATwVbWcBm/Prototipo-aplicativo-ARENA), consultado em 9 de outubro de 2026. A cópia local do Make forneceu os arquivos `src/App.tsx` e `src/index.css` da revisão `5be4a30d063aec203523603b2f7c71fe2b4ae5c3`.

O cliente web reproduz o logo SVG, fontes Inter/Sora, verde `#005a36`, fundo `#e2e4e9`, texto `#495057`, cards, carrossel de modalidades, capa e avatar do perfil e navegação inferior com cinco destinos. Em telas maiores mantém o painel de 390 px do protótipo; até 430 px ocupa a tela e considera a área segura inferior.

A imagem usada pelo protótipo foi armazenada em `web/public/images/arena-cover.jpg`, sem substituição. Origem: `https://images.unsplash.com/photo-1668194645738-ef8dbb426086?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1080`. O logo é vetorial e os demais ícones usam Lucide, como a referência.

## Integração e limites

Cadastro, login, sessão, edição de nome, cidade, posição e disponibilidade continuam usando a API. A saudação, avatar e modalidades usam os dados da conta. As informações demonstrativas do Figma (pontuação, vitórias, partidas, seguidores, saldo, campeonatos e publicações) não são registros reais e não foram importadas. Essas áreas apresentam estados vazios ou indicação de disponibilidade futura. O botão Jogar leva à preparação dos perfis esportivos enquanto o agendamento de partidas não existe na API.

Esta revisão modifica o frontend web. O cliente Expo mantém a implementação anterior. Em 12 de outubro de 2026 o Expo ganhou as telas das etapas 1 a 5 (veja a [situação da fundação](situacao-fundacao.md)), mas a paridade visual do Expo com a web ou com esta revisão **não foi verificada**, nem o funcionamento em aparelho.

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

## Revisão do conteúdo do perfil — 10 de outubro de 2026

Em sessão de protótipos, o usuário fechou as decisões abaixo para o conteúdo do perfil, registradas no [plano](plano-perfil-conteudo.md). Elas valem para a web e para o Expo e também para o feed da Comunidade. O HTML final do protótipo foi copiado para `artifacts/prototipos/perfil-conteudo.html` (não versionado) como referência.

| Parte | Decisão aplicada |
| --- | --- |
| Abas (A) | **Fotos \| Partidas**, com ícone e fixas abaixo do topo. Atividades saiu do perfil e deve ir para Notificações em entrega futura. |
| Grade | Três colunas de ponta a ponta, com altura mínima na aba. No perfil próprio, o quadro "Nova foto" completa a última linha. |
| Visualizador | Página "Publicações" com feed vertical que abre no post tocado. |
| Post (A3) | Foto 4:5 com autor e data sobrepostos, pílulas de curtir e comentar sobre a imagem e legenda abaixo. `Post` não tem modalidade, por isso o sobreposto mostra autor e data em vez da modalidade do protótipo. |
| Comentários (C4) | Vidro escuro sobre a foto, com envio por ícone. |
| Menu ••• (M3) | Vidro sobre a foto. Dono: editar legenda (contador /2200) e excluir com confirmação. Visitante: denunciar. |
| Denúncias | Post (M3), comentário (bandeira → formulário no vidro C4) e conta (••• da capa → vidro em tela cheia com Bloquear e Denunciar). Motivos: spam, assédio, conteúdo inadequado e outro, com detalhes opcionais de até 1000 caracteres. |
| Topo | Barra fixa que condensa: botões em círculos de vidro sobre a capa e, depois da capa, fundo claro com @usuário. |
| Partidas (P2) | Boletim por modalidade registrado **somente como desenho**. Sem domínio de partidas no backend, a aba mostra apenas um estado vazio; nenhum resultado é simulado. |

Na Comunidade, o card de post anterior deu lugar ao post A3. No Expo, sem bibliotecas de ícones ou desfoque, os botões usam glifos Unicode com rótulos de acessibilidade e o vidro é uma camada escura semitransparente; não há declaração de paridade visual com a web nem validação em aparelho.

## Migração para Tailwind — 11 de outubro de 2026

A troca do CSS escrito à mão por utilitários Tailwind ([plano](plano-migracao-tailwind.md)) não mudou a interface aprovada: paleta, tipografia, espaçamentos e comportamento foram preservados.

**Como a web foi conferida:**
- Linha de base de 138 capturas em Chrome headless: 46 telas em 320, 390 e 1440 px.
- Comparação por pixel a cada etapa e após ligar o preflight. Nenhuma tela teve diferença perceptível; restou apenas o ruído medido entre duas capturas sem mudança.
- Comparação de estilos computados e geometria.
- Conferência de teclado e foco: 66 itens em cada largura.

**Mudanças de comportamento, sem efeito visual:**
- As abas de Conexões passaram a aceitar setas, Home e End, como as abas do perfil.
- Ao fechar com Esc os vidros sobre a foto do post (comentários e •••), o foco volta ao botão de origem. Antes, ia para o corpo da página.

**Expo:** foi migrado para NativeWind preservando os valores visuais anteriores do app, mas sem conferência em aparelho. Não há declaração de paridade visual.

## Nova Comunidade — 11 de outubro de 2026

Em dez rodadas de protótipos, o usuário redesenhou a Comunidade. As decisões estão no [plano](plano-comunidade.md) e valem para a web e o Expo:

- **Barra:** barra escura (`forest`) com o Coliseu e as abas Publicações | Atletas sublinhadas em menta. O título recolhe ao rolar.
- **Atualizar:** puxar o feed para baixo no topo.
- **Feed:** o mesmo post do visualizador do perfil.
- **Estados:** estilo "arquibancada" (vazio, carregando, fim da lista e erro).
- **Atletas:** busca dentro da barra e uma fileira com quem você segue.
- **Nova publicação:** tela cheia escura em dois passos (recorte e depois legenda).

Uma revisão posterior mudou o post. As regras abaixo **substituem o post A3** da revisão de 10 de outubro, também no visualizador do perfil:

- **Proporção 1:1.** O recorte e o servidor já eram quadrados, mas a exibição em 4:5 cortava as laterais.
- **Autor como etiqueta compacta de vidro escuro:** avatar sem contorno branco e `@usuário` (o @ em menta), no lugar do nome sobre a foto. O tom escuro mantém a leitura em fotos claras.
- **Data no início da linha da legenda.** O ••• fica num círculo do mesmo vidro.

O protótipo foi rejeitado na versão de barra clara mínima, considerada "muito Instagram". A fonte do protótipo final está em `artifacts/prototipos/comunidade.src.html`, que não é versionada.

**Expo:**
- (Estado de 11 de outubro) Sem marca do Coliseu nos assets do mobile: a barra mostra só o título, e o estado vazio usa um glifo. Desde 12 de outubro o Expo tem os SVGs da marca e dos elos (`npm run generate:brand`); a conferência visual da Comunidade com eles não foi feita.
- O recorte é o editor nativo do seletor de fotos, sem os controles de zoom, giro e centralização da web.
- Não há declaração de paridade visual nem validação em aparelho.
