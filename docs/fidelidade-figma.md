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

**Emenda de 26 de novembro de 2026:** os PNGs provisórios foram substituídos pelos [selos de modalidade](#selos-de-modalidade--26-de-novembro-de-2026) vetoriais e removidos do repositório.

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
| Partidas (P2) | Substituído em 12 de outubro de 2026 pela **linha do tempo** de [plano-perfil-partidas.md](plano-perfil-partidas.md): trilho único com separadores por mês, registros "Duelo" (mini placar com selo de resultado, faixa de campeonato, "Ausente" no W.O., sets do tênis, pílulas de pontos e estatísticas), corrida contra o melhor anterior, canceladas e sem resultado esmaecidas e, só no perfil próprio, a próxima partida em cartão forest. Dados reais de `GET /users/{id}/timeline`; nenhum resultado é simulado. |

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

## Mensagens de retorno: toasts, aviso de conexão e erro de carregamento — 13 de outubro de 2026

Ajuste posterior pedido pelo usuário, decidido em sessão de protótipos e registrado no [plano](plano-toasts.md). Não vem do Figma. Substitui os blocos de retorno parados na página:

- **Toast "Vidro do Coliseu", cartão "Anel":** vidro escuro com a linha e o Coliseu na cor do tom, anel de tempo em volta do glifo, ação em pílula e X sempre visível. Tons: sucesso (menta), informação (`--color-info-soft`), aviso (`--color-warning-soft`) e erro (`--color-danger-soft`). Pilha em baralho acima da navegação inferior; sucesso 4 s, informação 5 s, aviso 7 s e erro até ser fechado.
- **Aviso de conexão:** faixa presa à navegação ("Sem conexão com a ARENA", contagem e "Tentar agora") e folha escura que só abre quando o usuário tenta uma ação.
- **Erro de carregamento (`LoadError`):** Coliseu grande, título, texto e "Tentar novamente" nas telas; variante compacta nas seções.
- **Junto ao campo:** validação de formulário, como antes.

No Expo o vidro é sólido (sem desfoque) e o texto usa a fonte do sistema, sem Sora nem Inter. Não há declaração de paridade visual do Expo nem validação em aparelho.

## Tema claro e escuro "Estádio à noite" — 13 de outubro de 2026

Ajuste posterior pedido pelo usuário, decidido em sessão de protótipos e registrado no [plano](plano-tema.md) e na [decisão 0004](decisoes/0004-tema.md). Não vem do Figma. O claro aprovado não muda: as capturas do claro, antes e depois, ficaram idênticas, exceto o Menu, que ganhou o cartão Aparência. O escuro amplia a paleta:

- **Paleta:**
  - fundo preto esverdeado (`#040806`) com um holofote suave no topo do painel;
  - cartões em degradê escuro com a borda acesa (`#ffffff12`) e sem sombra;
  - menta (`#8fe0b4`) nos botões, links e contadores, com texto escuro (`#04100a`) sobre ela;
  - dourado dos elos (`#F4DE9A`) nos sobretítulos, nos quadros de ícone e no item selecionado dos segmentados;
  - títulos em branco.
- **Placas forest** (Sua posição, Jogar, Salão), vidro, toasts e telas escuras por design ficam iguais nos dois temas.
- **Navegação inferior:** preta translúcida com desfoque, moldura dourada no item ativo e botão Jogar em menta com brilho.
- **Controle:** cartão "Luzes do estádio" no Menu do Perfil (seção Aparência), com Dia, Noite e Automático.
- **Ícones de esporte:** brancos no escuro, pintados por máscara a partir do PNG com alfa.
  - **Emenda de 26 de novembro de 2026:** a máscara e o PNG com alfa saíram. No escuro, o selo usa disco escuro e detalhes no dourado dos elos, por token (ver [selos de modalidade](#selos-de-modalidade--26-de-novembro-de-2026)).

No Expo, o cartão escuro é chapado (sem degradê) e não há borda acesa onde o claro não tinha borda. Não há declaração de paridade visual do Expo nem validação em aparelho.

## Nova tela de Início — 22 de novembro de 2026

Ajuste posterior pedido pelo usuário, decidido numa sessão de protótipos com seis rodadas e registrado no [plano](plano-inicio.md). Não vem do Figma. Vale igualmente para a web e para o Expo, que passaram a ter as mesmas seções, na mesma ordem, com os mesmos textos e estados. O protótipo consolidado está em `artifacts/prototipos/inicio.html`, que não é versionado e deve ser aberto por um servidor HTTP local, porque as máscaras não carregam via `file://`.

**Decisões da sessão de protótipos:**
- **Saudação:** data por extenso e "A arena te chama, {primeiro nome}", sem pontuação final.
- **Placar:** a próxima partida vira o bloco principal, escuro por design (`forest` com o Coliseu), igual nos dois temas. Mostra a Contagem em números grandes ("3 dias 4 h", "5 h 20 min", "40 min"), a data e a hora e a linha do confronto, que abre a partida. Em partida individual, aparece "Você". Sem partida, mostra "—" e "Nenhuma partida agendada".
- **Botão principal:** logo abaixo do Placar, com "Encontrar partida", "Encontrar outra partida" ou "Preparar perfis".
- **Destaque:** a pendência mais urgente num cartão claro (`surface`), com "Mais urgente" ou "Aguardando você", o prazo, o botão visual "Responder" e a borda âmbar quando o prazo está no fim. Embaixo, "+ n pendências · ver todas".
- **Pílulas:** "Seu elo" num bloco escuro por design com três pílulas (futebol, tênis e corrida), com o emblema e a métrica ou a situação ("n de 3", "Sem marca", "Sem perfil"). Nunca aparece elo para quem está em classificação.
- **Campeonatos:** rodapé com os campeonatos reais das cidades dos perfis esportivos, no lugar da foto. O cartão "Complete seu perfil esportivo" continua enquanto falta modalidade.
- Formatos explorados e descartados estão listados no [plano](plano-inicio.md#decisões-da-sessão-de-protótipos).

**O que saiu da tela:**
- a foto "Perto de você / Sua próxima arena" (`arena-cover.jpg` continua no produto, como capa padrão do Perfil);
- o carrossel de cartões de modalidade e a barra de progresso sempre vazia;
- a placa escura "Para responder" (`PendingPlate`), removida dos dois clientes;
- a saudação "Bora jogar, {nome}?" e a seção separada "Próxima partida";
- no Expo, o subtítulo próprio e os grupos de atalhos JOGAR, ORGANIZADOR e ADMINISTRAÇÃO. Os destinos continuam no Jogar e no menu do Perfil, como na web.

**Desvios visuais mantidos em relação ao protótipo:**
- O título da saudação mantém 25 px. O protótipo usa 22 px.
- Placar e Pílulas usam `forest` liso, sem o gradiente do protótipo, iguais nos dois temas.
- O título do cartão do Destaque fica em caixa alta, o rótulo curto da pendência. O protótipo usa caixa de frase.
- As etiquetas dos campeonatos seguem o formato dos cartazes ("R$ 40", "8 de 16 times"), e não "R$ 40 por time" e "8 de 16 vagas".
- O cartão do próximo passo mantém o texto atual ("Mostre onde e como você gosta de jogar."), e o convite sem perfis segue a spec ("Configure suas modalidades"). O protótipo mostrava "Escolha suas modalidades para jogar" e "Defina sua cidade".
- Os lados do confronto usam os tamanhos existentes de escudo e avatar. Sem quadra definida, a linha do local não aparece.
- Na web, os ícones de modalidade sobre os blocos escuros são pintados por máscara (`SportIcon`; desde 26 de novembro de 2026, símbolo com aro vetorial em branco, ver [selos de modalidade](#selos-de-modalidade--26-de-novembro-de-2026)). A 320 px, o título dos Campeonatos e o convite sem perfis truncam com reticências, e a métrica da corrida ("1:45:30 · 21 km") quebra em duas linhas, sem overflow.
- No Expo, a marca d'água do Placar fica centralizada (placa `TeamsPlate`), e a das Pílulas fica no canto. Os ícones usam os SVGs com alfa e o `Icon` existentes, sem desfoque.

A web foi conferida no navegador, com API e PostgreSQL reais, em 320, 390 e 1440 px, nos temas claro e escuro. As verificações estão na [situação da fundação](situacao-fundacao.md). No Expo, não há declaração de paridade visual nem validação em aparelho.

## Landing e nova tela de entrada — 24 de novembro de 2026

Ajuste posterior pedido pelo usuário, decidido numa sessão de protótipos com seis rodadas. Não vem do Figma. A especificação de trabalho está em `.scratch/landing-entrada/spec.md`, e o protótipo consolidado, em `artifacts/login-prototipos/index-final.html`, com as imagens da mesma pasta. Nenhum dos dois é versionado, e o protótipo deve ser aberto por um servidor HTTP local. Ele é material de consulta: os textos, as cores e os comportamentos da spec prevalecem. O registro da entrega está na [situação da fundação](situacao-fundacao.md).

**Decisões da sessão de protótipos:**
- **Conceito (rodada 1):** entre "Estádio à noite", "Pôr do sol", "Dividida" com foto, "Página com rolagem" e "O Portão", ficou o hero do **Estádio à noite**: tela escura por design, com refletores, brilho do gramado e arco do campo. Dele vêm a informação ao rolar, da "Página com rolagem", e a animação do portão ao entrar, do "O Portão".
- **Rolagem (rodada 2):** entre revelação suave, refletores, subida de elo, trilho horizontal e amanhecer, ficou a **subida de elo**. A seção fica presa enquanto a rolagem sobe do Bronze ao Lendário, trocando brasão, nome, texto e tom do fundo, com um trilho vertical dourado. Os demais blocos surgem com a revelação suave. A seção só explica a progressão e não atribui elo a ninguém.
- **Hero:** o título passou a ser "A arena te chama", com "arena" em menta e sem sobretítulo. Abaixo vêm o texto de apoio, o botão "Entrar na Arena" e uma seta fina de rolagem, que balança devagar e leva às modalidades.
- **Modalidades (rodada 3):** entre lista editorial, frase que acende, **colunas**, placar e faixa dentro do hero, ficaram as colunas. São três colunas altas, cada uma no tom da modalidade e com o ícone de `SportIcon` em marca d'água. A coluna em foco se expande e mostra a descrição e os formatos. Não há título acima.
- **Como funciona e Mais da Arena (rodada 4):** entre "Apito a apito", "Ingressos", "Numeral e mapa", **"Colunas também"** e "Manifesto", ficou "Colunas também". "Como funciona" usa as mesmas colunas, com quatro passos em verdes crescentes, e "Mais da Arena" vira uma **sanfona** de nomes grandes, com um item aberto por vez e o título aberto em menta.
- **Numerais (rodada 5):** entre degradê, traço desenhado, **romano**, sete segmentos e matriz de LED, ficaram os **numerais romanos I–IV**. São SVGs próprios, com serifas retas e traço dourado, que conversam com o Coliseu e com o Lendário. O numeral da coluna aberta ganha preenchimento.
- **"Criar conta" (rodada 5):** entre contorno, **embaixo**, pílula, ícone e sublinhado, ficou "embaixo": "Primeira vez por aqui? Crie sua conta →" abaixo do botão, com a seta deslizando no hover e no foco. O mesmo par fica no hero e no fecho "Os portões estão abertos.".
- **Portão:** duas folhas forest, cada uma com metade do Coliseu, fecham sobre a landing com o selo `arena.` no centro e abrem já na tela de entrada. Com "reduzir movimento", a troca é direta.
- **Tela depois do portão (rodada 6):** entre vidro central, portão entreaberto, **Dividida**, túnel e sem cartão, ficou a Dividida. Uma metade tem o Coliseu dourado esmaecido e a chamada, que muda com o modo: "A arena te chama" ou "Sua trajetória começa aqui". A outra metade tem o formulário sem cartão. Até 860 px, a metade da marca vira uma faixa no topo.
- **Expo:** fica só com a **Dividida estreita**, com a faixa da marca no topo e o formulário abaixo. Não há landing nem portão, e a data continua no campo DD/MM/AAAA, sem nova dependência nativa.
- **Data de nascimento na web:** usa o `DatePicker` do shadcn no tom escuro, com mês e ano em listas.

**O que foi descartado e por quê:**
- **Sobretítulo + título + grade de cards** nas modalidades: o usuário achou o padrão genérico demais. As modalidades viraram colunas, e "Como funciona" e "Mais da Arena" também ficaram sem título com grade de cards. Cada seção tem um `h2` só para leitores de tela, sem título visível.
- **Sobretítulo "Futebol · Tênis · Corrida" acima do hero e o título "Suba de elo. Em campo."**: retirados a pedido. O título passou a ser "A arena te chama".
- **Botão redondo pulsante**, com ondas e brilho, do conceito "O Portão": também foi considerado excessivo. O usuário queria só a animação do portão ao clicar. Todos os "Entrar na Arena" viraram botões comuns, sem brilho nem pulso.
- **Botão no cabeçalho:** com ele, a página tinha três "Entrar na Arena". Ficaram só o do hero e o do fecho, e o cabeçalho mostra apenas a marca.
- **Numerais por contorno de fonte:** o vazado com `text-stroke` na Sora desenhava as emendas dos contornos sobrepostos da fonte, e o 3 e o 4 saíam malfeitos. Por isso os numerais passaram a ser SVGs desenhados à parte.
- **Indicador de rolagem anterior:** deu lugar à seta fina.

**Desvios mantidos em relação ao protótipo e à spec:**
- **Tela de entrada da web:**
  - O seletor de data usa o tom `dark` existente do `DatePicker`.
  - A metade da marca entra com uma animação de 0,3 s a cada montagem, só com movimento permitido.
  - Só o login recusado (401) marca e-mail e senha como inválidos.
  - O aviso de sessão expirada usa o novo tom `warning` dos avisos.
- **Landing:**
  - O título do hero tem largura máxima de 16 caracteres e fica numa linha a 1440 px.
  - "Crie sua conta" é um botão em linha com alvo de 24 px.
  - Cada seção tem um `h2` só para leitores de tela. O sobretítulo da subida de elo é o `h2` visível.
  - Os nomes acessíveis das colunas incluem o número ("01 Futebol", "Passo 01 Crie sua conta"). Assim, a landing mantém exatamente dois convites "Crie sua conta".
  - Escolher o item já aberto o mantém aberto. O fecho também é revelado ao rolar. O movimento reduzido é lido uma vez, ao montar a landing.
- **Subida de elo:**
  - A seção ocupa cinco telas de rolagem, com cada elo a 25% do caminho, como no protótipo.
  - Com 1440 px, o conteúdo preso fica à esquerda do centro, como no protótipo.
  - Há ajustes extras para larguras e alturas até 560 px.
  - O elo ativo não usa `aria-current`.
  - Com movimento reduzido, o trilho e o fundo não aparecem, e os cinco elos ficam em sequência.
- **Portão:**
  - As durações seguem o protótipo: fecha em 0,55 s, troca de tela por volta de 0,88 s, abre em 0,85 s e some por volta de 2,1 s.
  - Durante a sequência, as teclas sem modificador são bloqueadas, porque Tab + Enter chegava ao "Pular para conteúdo", fora da área inerte.
  - A roda do mouse ainda rola a página por baixo do portão.
- **Navegação:**
  - Ao voltar à landing, o foco não é movido nem a rolagem é restaurada.
  - Depois de entrar pela landing, um Voltar do navegador passa pela entrada anterior da landing sem mudança visível.
  - Uma nova tentativa depois de falha de `/me` que termina sem sessão mostra a landing. Sair da conta também mostra a landing.
- **Expo:**
  - O aviso de sessão expirada mantém "Sua sessão expirou. Entre novamente.", sem o "para continuar" da web.
  - Os campos de credencial não ficam marcados como inválidos.
  - Os rótulos seguem o estilo do `FormField` escuro, em caixa alta pequena, e não os rótulos brancos do protótipo.
  - O carregamento antes da leitura de `/me` continua seguindo o tema.

A web foi conferida no navegador, com API e PostgreSQL reais, em 320, 390 e 1440 px, nos temas Dia e Noite e com movimento reduzido. As animações só foram vistas no Chromium headless, sem aparelho nem Safari. No Expo, não há declaração de paridade visual com a web nem validação em aparelho.

## Selos de modalidade — 26 de novembro de 2026

Ajuste posterior pedido pelo usuário. Não vem do Figma. O designer entregou novos ícones de futebol, tênis e corrida: selos circulares com disco verde, coroa de louros, anel e símbolo central. Os arquivos chegaram como bitmaps embutidos em SVG, com um defeito de recorte, e foram recriados como vetores reais. Uma sessão de protótipos com cinco rodadas decidiu como os selos entram no app. Eles **substituem os ícones provisórios em PNG** de 9 de outubro, que saíram dos dois clientes junto com o script com Pillow. A especificação de trabalho está em `.scratch/selos-modalidade/spec.md`, e o protótipo, em `artifacts/prototipo-selos/index.html`. Nenhum dos dois é versionado, e o protótipo deve ser aberto por um servidor HTTP local. Ele é material de consulta: a spec prevalece. As cores por tema e o fim das compensações estão na [decisão do tema](decisoes/0004-tema.md#6-selos-de-modalidade--26-de-novembro-de-2026), e o registro da entrega, na [situação da fundação](situacao-fundacao.md).

**Decisões da sessão de protótipos:**
- **Três formas:** o **selo** completo (disco, coroa, anel e símbolo) nos tamanhos maiores, o **símbolo com aro** (só o desenho central num anel fino) nos tamanhos pequenos e a **marca d'água** (só o símbolo, grande e translúcido, cortado no canto). A direção "selo + símbolo" veio da primeira rodada, e a segunda definiu o tratamento de cada grupo de componentes.
- **Ladrilho redondo (rodada 3):** o selo fica centralizado num ladrilho circular tingido `icon-tile`, ocupando 75% do diâmetro, no tamanho de cada contexto. O troféu de campeonato sem modalidade usa o mesmo ladrilho, para a coluna de ícones da lista ficar uniforme. No escuro, o selo tem disco escuro e detalhes no dourado dos elos.
- **Símbolo com aro (rodada 4):** entre 100%, **85%** e 78% da caixa, ficou 85%. A mesma escala vale para as três modalidades.
- **Onde cada forma entra:**
  - **selo em ladrilho redondo:** linhas de campeonato do Início, card de categoria do ranking, ícone da folha do perfil esportivo, nó do trilho da linha do tempo, opções de modalidade da folha de categoria e opções do filtro da linha do tempo;
  - **símbolo com aro só no item ativo:** chips de filtro por modalidade, abas do Jogar, modalidades do pedido de organizador e do assistente de evento. O item inativo mostra só o texto, sem espaço reservado, e a largura do item pode variar ao ganhar o ícone;
  - **símbolo com aro sempre:** pílulas "Seu elo", selo de modalidade do placar, rodapé do cartaz de evento e a linha "{Modalidade} é a sua única modalidade ativa" da folha de categoria;
  - **marca d'água (rodada 5):** faixas de "Suas modalidades" e colunas de modalidade da landing, mantendo posição, tamanho e opacidades anteriores.

**O que foi descartado e por quê:**
- **Ajuste óptico do tênis** ("Tênis maior"): avaliado na rodada 4 e não escolhido. A raquete usa a mesma escala da bola e da pista.
- **Ícone em todos os itens** de chips, abas e seletores: ficou só no item ativo, decisão fixada antes da rodada 5. O ícone não substitui o estado de seleção, que continua no estilo e em `aria-pressed`, `aria-selected` ou `checked`.
- **Inversões, misturas e máscaras de PNG:** a geometria vetorial é colorida por token ou pela cor do texto, nos dois temas.

**Desvios mantidos em relação ao protótipo e à spec:**
- **Geometria:** o símbolo do futebol inclui o anel interno fino do desenho do designer, que aparece também no símbolo com aro e na marca d'água. As cordas da raquete são recortadas analiticamente.
- **Web:**
  - O fundo do ladrilho do card de categoria do ranking passou de `tile` para `icon-tile`, porque o `tile` do escuro é igual ao disco do selo.
  - O trilho da linha do tempo mantém o círculo opaco de 32 px, com o ladrilho redondo de 30 px dentro.
  - Onde não havia quadro (folha de categoria e filtro da linha do tempo), o tamanho do ícone anterior virou o diâmetro do ladrilho. O selo fica com 18 px nesses contextos.
  - Os chips do cabeçalho do perfil (`ProfileHeader`), fora do mapeamento, estão sempre ativos e mostram o símbolo com aro em `on-brand`, pela regra do chip.
  - O ícone tem tamanho explícito: 20 px nos chips e 22 px nas opções de modalidade. No pedido de organizador, a opção marcada reduz o espaçamento à esquerda para acomodar o ícone.
  - Na faixa de "Suas modalidades", o deslocamento inferior passou de 18 para 14 px, o que compensa o espaço de linha do ícone anterior e mantém a posição desenhada igual. O símbolo novo é um pouco mais alto que os louros antigos na mesma caixa, e a raquete é mais estreita.
  - O troféu no ladrilho redondo foi conferido só nos testes, porque o Início real lista campeonatos por modalidade.
- **Expo:**
  - Nas pílulas ativas, o símbolo com aro segue a cor do texto da pílula ativa, e não o `on-brand` literal, que sumiria sobre o forest no escuro.
  - O fundo dos ladrilhos de Campeonatos e do card de categoria passou de `tile` para `icon-tile`, e o troféu, de `brand` para `icon-tile-ink`.
  - O ladrilho do trilho tem 26 pt dentro do nó opaco de 30 pt, e a opção de categoria selecionada mantém o selo sobre o forest.
  - O selo de 18 pt da folha do perfil esportivo pode perder detalhe da coroa em aparelho.

A web foi conferida no navegador, com API e PostgreSQL reais, em 320, 390 e 1440 px, nos temas Dia e Noite, sem requisições a ícones raster de modalidade. No Expo, as verificações foram testes, checagem de tipos e exportação do bundle Android. Não há declaração de paridade visual do Expo nem validação em aparelho.
