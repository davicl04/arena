# Decisões — Web responsiva (celular, tablet e computador)

Data: 28 de novembro de 2026. Só apresentação do cliente web: nenhum contrato de API, dado, regra de domínio, esquema ou dependência novos. O resultado das verificações de cada entrega e da verificação final está na [situação da fundação](../situacao-fundacao.md), seção "Web responsiva: celular, tablet e computador".

## 1. Contexto

Até esta decisão, a web simulava um celular. Até 430 px ela ocupava a tela; acima disso, o app inteiro era um painel fixo de 390 × 844 px no meio da janela (`data-slot="app-frame"`), com navegação inferior e folhas e diálogos presos a esse painel. Isso servia enquanto a web era a referência visual do app ([fidelidade visual](../fidelidade-figma.md)). Desde a [paridade visual do Expo](../fidelidade-figma.md#paridade-visual-do-expo-com-a-web--27-de-novembro-de-2026), o Expo é o cliente de celular fiel, e a web passa a atender de verdade o tablet e o computador. Pedido do usuário em 28 de novembro de 2026.

Decisões confirmadas pelo usuário:

1. **Computador com barra lateral** à esquerda; no celular continua a navegação inferior.
2. **Abas com composição própria:** Início, Ranking, Jogar, Comunidade e Perfil se reorganizam em grades e colunas com os mesmos blocos. As subtelas ficam numa coluna centralizada, com grade onde houver lista de cartões.
3. **Sobreposições em telas largas:** folhas inferiores viram diálogo centralizado, e telas cheias viram painel centralizado sobre fundo escurecido.
4. **No celular, exatamente como antes:** nada do que existe no celular muda de aparência, estrutura, ordem, texto ou interação.

## 2. Faixas e fonte única

| Faixa | Largura | Estrutura |
| --- | --- | --- |
| Celular | até 767 px | A de antes: tela cheia, navegação inferior, folhas inferiores e telas cheias. |
| Tablet | 768 a 1023 px | Trilho lateral compacto e conteúdo ao lado. |
| Computador | a partir de 1024 px | Barra lateral com a marca e conteúdo ao lado, com largura máxima. |

- Entre 431 e 767 px, a janela mostrava o painel de 390 px emoldurado; agora mostra o layout de celular em tela cheia. Até 430 px nada muda, pixel a pixel.
- **CSS:** os limites ficam uma vez em `web/src/ui.css` (`--breakpoint-md: 48rem`, `--breakpoint-lg: 64rem`, no `@theme`), usados pelas variantes `md:` (tablet e acima) e `lg:` (computador). `sm:` e `xl:` não servem para layout. A variante `app-narrow:` deixou de existir.
- **JavaScript:** `web/src/hooks/useLayout.ts` repete as mesmas consultas (`LAYOUT_QUERIES`) sobre `matchMedia`. `useLayout()` devolve `'celular' | 'tablet' | 'computador'` e atualiza ao cruzar 768 ou 1024 px; `useWideLayout()` devolve `true` em tablet e computador.
- **Regra de uso:**
  - estilo sem variante é o do celular;
  - a aparência de tablet e computador entra por `md:`/`lg:`;
  - a estrutura (elemento que existe numa faixa e não na outra) vem do gancho, para o DOM do celular continuar o de antes;
  - sem `matchMedia` (Vitest no jsdom, ambiente sem janela), o gancho responde celular. Os testes de faixa larga simulam `matchMedia`, como em `web/tests/web-responsivo-layout.test.tsx`.

## 3. Estrutura

- O `app-frame` (`web/src/pages/ArenaPage.tsx`) ocupa a janela em todas as faixas e continua sendo o contêiner de diálogos, folhas, telas cheias, toasts e do aviso de conexão (`DialogContainerProvider`).
- No celular, o `main` rola por baixo da navegação inferior, que é absoluta, com a reserva da altura dela, como antes.
- Em tablet e computador, o `app-frame` é uma grade de duas colunas: navegação lateral (`--app-nav-inset`) e `main`. A rolagem continua no `main`, com o foco e a volta ao topo ao trocar de tela. A lateral vem antes do `main` no DOM, e assim a ordem de tabulação é lateral → conteúdo; "Pular para conteúdo" (`web/src/App.tsx`) leva ao `main#main`.
- `--app-nav-inset` vale 0, 88 ou 256 px conforme a faixa. Algo absoluto no `app-frame` que precise ficar sobre a área de conteúdo usa `md:left-(--app-nav-inset)`.

## 4. Navegação por faixa

`web/src/components/BottomNav.tsx` tem um só `nav` com `aria-label="Navegação principal"` e os mesmos cinco botões (Início, Ranking, JOGAR, Comunidade, Perfil), na mesma ordem, com `aria-current` e o ponto de atenção do Jogar. Muda só a apresentação:

- **celular:** barra inferior, como antes;
- **tablet:** trilho lateral de 88 px com o símbolo da marca (`ArenaMark`) e os destinos em ícone e rótulo curto;
- **computador:** barra lateral de 256 px com o `Logo`, os destinos em linha e o Jogar como botão `bg-brand`.

Em tablet e computador, e só nelas (pelo gancho), a lateral (`data-slot="app-sidebar"`) traz no pé **Notificações**, com a contagem, e **Menu**. Com uma dessas telas aberta, o atalho fica com `aria-current` no lugar do destino. Para não duplicar, os sinos e o atalho de menu dos cabeçalhos das abas não são renderizados nessas faixas. No celular, os cabeçalhos ficam como antes.

## 5. Medidas de conteúdo

Só valem em tablet e computador; no celular, o respiro lateral continua o de antes.

- **Coluna de leitura:** `--container-leitura` (40rem = 640 px), utilitário `max-w-leitura`. É o padrão de todas as telas: o `main` recebe `md:px-medida`, que centraliza o conteúdo nessa coluna com respiro lateral mínimo de 2rem (2.5rem a partir de `lg`).
- **Medida larga:** `--container-larga` (70rem = 1120 px), utilitário `max-w-larga`, para abas com grade de blocos.
- **Escolher outra medida** sem editar o `ArenaPage`: o elemento raiz da tela (filho direto do `main`) recebe `data-largura`:
  - `data-largura="larga"`: a medida larga;
  - `data-largura="total"`: de ponta a ponta da área de conteúdo, sem respiro. A própria tela centraliza o conteúdo interno com `mx-auto max-w-leitura` ou `mx-auto max-w-larga`.
- **Placas, capas e barras escuras de ponta a ponta** continuam encostadas no topo da área de conteúdo (o `ArenaPage` não lhes dá `md:pt-*`; as demais telas recebem `md:pt-8`). Com `data-largura="total"` na raiz, a placa recebe `md:px-coluna-leitura` ou `md:px-coluna-larga`, que alinham o conteúdo dela à medida do conteúdo de baixo. O respiro mínimo é `--coluna-respiro` (0 por padrão).

## 6. Sobreposições

No celular, folhas sobem da base e telas cheias cobrem o app, como antes. A partir de 768 px:

- **Folhas** (`Sheet`, `web/src/components/ui/sheet.tsx`, inclusive a escura) viram diálogo centralizado de 480 px, com os quatro cantos arredondados, sem a alça e com rolagem interna e altura de até 832 px (a janela menos 2rem de cada lado). Uma folha mais larga passa `md:max-w-[35rem]` em `className`.
- **Telas cheias** (proposta, oferta de vaga, registrar corrida, publicar foto, ver post, prévia do Story e o vidro de tela cheia) acrescentam `widePanel` (`web/src/components/ui/overlay-variants.ts`) e viram painel centralizado de 480 px de largura e até 832 px de altura (704 px na proposta e na oferta; a altura do conteúdo no vidro), sobre o fundo escurecido. O conteúdo pensado para o celular não estica.
- **Portal:** em tela larga, folhas e telas cheias entram por portal no `app-frame` (`useOverlayPortal`, `web/src/hooks/useOverlayPortal.ts`), e o fundo cobre também a navegação lateral. O portal é necessário porque o `main` do Perfil usa `@container-size` e prenderia a sobreposição. `scrim: true` acrescenta o fundo (`overlayScrim`) às telas cheias, que não tinham um. No celular, a sobreposição fica onde a tela a renderiza.
- **O `Dialog` comum** (`web/src/components/ui/dialog.tsx`) continua centralizado, com largura máxima `sm:max-w-sm` (384 px), e ganha a sombra de diálogo (`md:shadow-dialog`, token `--shadow-dialog`).
- **Clique fora:** o fundo das folhas e o "Cancelar a busca?" continuam fechando. O fundo das telas cheias não fecha, porque no celular elas não têm fundo; na proposta, na oferta de vaga e no registrar corrida, o `Dialog` usa `disablePointerDismissal` em tela larga. Escape, foco inicial e devolução do foco continuam valendo.
- **Toasts e aviso de conexão:** em tablet e computador não reservam a altura da navegação inferior. Os toasts ficam a 16 px da base, com até 416 px de largura, centrados na área de conteúdo, ao lado da lateral (bloco "Toast" de `ui.css`). A faixa de conexão fica na base da área de conteúdo (`md:bottom-0 md:left-(--app-nav-inset)`).

## 7. Composição por tela

Até 767 px, todas as telas ficam como antes. Mesmos blocos, dados, textos e estados em todas as faixas; só a disposição muda.

| Tela | Tablet (768 a 1023 px) | Computador (a partir de 1024 px) |
| --- | --- | --- |
| Início | Medida larga, sem a marca e o sino do cabeçalho; saudação e duas colunas iguais (próxima partida, ação de jogar e "Para responder" \| "Seu elo", "Seu próximo passo" e campeonatos). | Igual ao tablet, com colunas de cerca de 7/5 (mínimo de 20rem à direita). |
| Ranking | Coluna única, na coluna de leitura. | Medida larga, duas colunas: categoria, times, entrada do Salão, estado sem elo, chips e "Sua posição" (presa ao rolar quando a janela tem altura) \| troca de elo, nota do elo visto e lista. |
| Salão dos Lendários | De ponta a ponta, escuro por design; voltar, cabeçalho e lista na medida larga; Lendários em grade de 2 colunas. | Igual ao tablet; 3 colunas a partir de 1440 px. |
| Jogar | Coluna de leitura; a placa vira painel de cantos arredondados a 32 px do topo. | Medida larga, duas colunas: a placa \| "Minhas partidas" ou "Suas marcas", com "Outras formas de jogar" ou "Provas". |
| Comunidade | Barra escura de ponta a ponta; abas Publicações \| Atletas; feed e Atletas numa coluna de até 35rem. | Feed na coluna de até 35rem e, ao lado, a coluna "Atletas", presa sob a barra e com rolagem própria; sem o seletor de abas. |
| Perfil (próprio e visitado) | Medida larga; capa 4:1; avatar maior sobre a borda da capa, à esquerda; "Minhas modalidades" e "Suas estatísticas" lado a lado; grade de fotos de 4 colunas; Partidas na coluna de leitura. No perfil próprio, o selo de edição vira o botão "Editar perfil". | Igual ao tablet, com grade de fotos de 5 colunas. |
| Notificações, Meus times, Entrar pelo link | Placa `forest` de ponta a ponta; conteúdo na coluna de leitura; carteirinhas de Meus times em grade de 2 colunas. | Igual ao tablet. |
| Criar/Editar time, Convidar | Já escuras de ponta a ponta, com o conteúdo na coluna de leitura; a barra ganha respiro no topo. | Igual ao tablet. |
| Menu | Coluna de leitura. | Medida larga, duas colunas (conta, organizador e administração \| aparência, app e sair). |
| Minhas modalidades | Coluna de leitura. | Medida larga, as três modalidades lado a lado. |
| Campeonatos e provas, Meus eventos | Medida larga; cartazes em grade de quantas colunas couberem. | Igual ao tablet. |
| Evento | Coluna de leitura; barra de inscrição presa à base da coluna. | Medida larga, duas colunas (cartaz, estado, inscrição e barra \| avisos e abas). |
| Gestão do evento | Placa de ponta a ponta; conteúdo na coluna de leitura. | Duas colunas ("Agora" e seções \| avisos e cancelar). |
| Chaveamento | Placa de ponta a ponta; a árvore sai da coluna de leitura (até 1120 px) e só rola na horizontal quando não cabe. | Igual ao tablet. |
| Partida | Cabeçalho de ponta a ponta e altura cheia, sem a reserva da navegação inferior. | Condições e resultado ao lado do chat, cada um rolando por dentro, com o campo de mensagem sempre visível. |
| Demais subtelas | Coluna de leitura: Editar perfil, Contas bloqueadas, Conexões, Pedidos de aliança, Pedido de organizador (regras em duas colunas), Criar/Editar evento, Decisão do resultado, Partidas do evento, Comprovantes, Denúncias e as filas da administração. | Igual ao tablet. |

As telas públicas (landing, entrada, cadastro, carregamento e o link de time sem sessão) ficam fora do `app-frame` e já eram responsivas; a conferência delas nas larguras intermediárias está na situação da fundação.

## 8. Como verificar

- **Regressão do celular (condição de aceite de toda mudança na web que possa afetar o celular):** a mesma web do commit de referência e a do candidato rodam o mesmo roteiro de telas, com a mesma API e cópias do mesmo banco de dados, em 320, 390 e 430 px de largura, nos dois temas. As capturas são comparadas pixel a pixel, com tolerância zero e sem regiões mascaradas. O roteiro exige relógio congelado, fontes locais, movimento reduzido e espera por rede, fontes e imagens antes de cada captura. A ferramenta usada nesta entrega é local e não versionada (ambiente auxiliar em `.local/`); o resultado é registrado na situação da fundação.
- **Larguras de conferência das faixas largas:** 768, 1024, 1440 e 1920 px, claro e escuro. Conferir a composição, a ausência de overflow horizontal e de erros no console, o teclado (ordem lateral → conteúdo, Tab preso, Escape e devolução do foco nas sobreposições) e "Pular para conteúdo".
- **Testes automatizados:** os testes do celular passam sem mudar a expectativa, porque no Vitest não há `matchMedia`. Os testes das faixas largas simulam `matchMedia` (arquivos `web/tests/web-responsivo-*.test.tsx` e `web/tests/*-tela-larga.test.tsx`).
- **Checks do AGENTS.md** em `web/`: `npm run lint`, `npm run build` e `npm run test:coverage`.

## 9. Consequências e limitações

- Telas novas nascem com a coluna de leitura em tablet e computador. Para outra medida, usam `data-largura`. Folhas e telas cheias novas usam os componentes-base (`Sheet`, `Dialog`, `Glass` com `variant="screen"` e, numa tela cheia própria, `widePanel` com `useOverlayPortal`), para herdar o diálogo e o painel de tela larga.
- Todo estilo novo de tablet ou computador fica sob `md:`/`lg:`. Qualquer mudança sem variante altera o celular e precisa de pedido explícito.
- **Tab nos diálogos do Base UI:** na proposta, na oferta de vaga, no registrar corrida e no "Cancelar a busca?", o Tab escapa para a navegação, como já acontecia no celular. Escape e a devolução do foco funcionam. A correção vale também para o celular e fica para uma entrega à parte.
- **Cruzar 768 px com uma folha ou tela cheia aberta** a remonta (ela muda de lugar na árvore) e o estado interno se perde.
- **Celular deitado** com 768 px ou mais de largura recebe o layout de tablet. Se incomodar no uso real, a faixa pode passar a exigir altura mínima.
- **Navegador:** a conferência foi feita só no Chromium headless, sem Safari, Firefox nem aparelho.
- Limitações de dados e de cobertura de cada tela estão registradas nas entregas da situação da fundação.

## 10. Fora do escopo

- **Expo:** continua sendo o cliente de celular; esta decisão não muda nem declara nada sobre ele.
- **Rotas e URLs:** a navegação entre telas continua sendo a pilha em memória do `ArenaPage`.
- Backend, contratos, esquema, funcionalidades, dados e textos novos; troca de paleta, fontes ou identidade; redesenho das telas no celular.
