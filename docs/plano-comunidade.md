# Plano — nova tela de Comunidade (web + Expo)

> Estado: **implementado em 11 de outubro de 2026** (web e Expo), conforme o registro em [situação da fundação](situacao-fundacao.md). No Expo, o recorte I5 continua pendente: o recorte é o editor nativo do seletor de fotos. O registro está na [situação da fundação](situacao-fundacao.md).

## Contexto

A Comunidade da web (`web/src/components/SocialCommunity.tsx`) empilha, numa só coluna, o cabeçalho "O ESPORTE CONECTA / Comunidade" com "Atualizar feed", a busca de atletas, o cartão "Compartilhe sua trajetória" e o feed de posts com cantos arredondados (`PostItem` com `layout="feed"`). O usuário pediu um feed semelhante ao visualizador "Publicações" do perfil e o uso de componentes shadcn/ui.

O desenho foi fechado em dez rodadas de protótipos em 11 de outubro de 2026. O protótipo final está no artefato privado do usuário (https://claude.ai/artifact/9rtTXhDkDFz9h3mqAtcnV8); a fonte local fica em `artifacts/prototipos/comunidade.src.html`, que não é versionada. Foram rejeitados a barra clara mínima, considerada "muito Instagram", e o cabeçalho com busca e compositor sobre o feed.

| Parte | Decisão |
| --- | --- |
| Estrutura (F2) | Barra escura compacta (`forest`) fixa no topo: Coliseu em menta, título "Comunidade" e ➕. Abaixo, abas sublinhadas em menta **Publicações \| Atletas**. O feed passa por baixo. |
| Barra (K2) | Ao rolar para baixo, a linha do título recolhe e só as abas ficam; ao rolar para cima, ela volta. O ➕ vira um círculo menta. Tocar em "Publicações" com a aba já ativa **só volta ao início**. |
| Atualizar | **Puxar para atualizar**: com o feed no topo, arrastar para baixo mostra "Puxe/Solte para atualizar" e recarrega a primeira página. O botão "Atualizar feed" sai. |
| Feed | Mesmo post do visualizador do perfil (`layout="viewer"`): foto de ponta a ponta, autor sobreposto, pílulas de curtir e comentar, legenda recuada e 6 px entre posts. |
| Autor no post (A5) | Etiqueta compacta de vidro escuro no canto: avatar **sem contorno branco** e **@usuário** (o @ em menta), no lugar do nome. O ••• fica num círculo do mesmo vidro. A data desce para o início da linha da legenda. Vale para a Comunidade e para o visualizador do perfil. |
| Proporção | **1:1** no recorte, no feed e no visualizador do perfil. Hoje o recorte e o servidor são quadrados, mas a exibição é 4:5 com `object-cover`, o que corta cerca de 10% de cada lateral. |
| Atletas (G2) | Na aba Atletas, a barra escura ganha o campo de busca. Antes de buscar: fileira horizontal com as fotos de quem você segue e uma dica. Com busca: lista com foto, nome, @, "Conta pública/privada", etiqueta "Segue você" e Seguir/Solicitar/Solicitado/Seguindo. Nada encontrado e carregamento têm estados próprios. |
| Publicar (H5 + P2) | O ➕ abre uma tela cheia escura. Fluxo em **dois passos**, com o indicador "① Recorte · ② Legenda" no topo: escolher e enquadrar a foto e tocar em **Continuar** (botão largo); depois a foto recortada fica visível e o painel de vidro traz a legenda e **Publicar** (botão largo). "Publicar" só existe no passo 2. |
| Recorte (I5) | Moldura 1:1 com a foto inteira visível e escurecida fora dela, grade de terços, atalhos de zoom **1× · 1,5× · 2× · 3×** (ToggleGroup), Slider fino, **girar 90°**, **Centralizar** e **Redefinir** (compactos e centralizados, lado a lado). Arrastar move; pinça e roda do mouse dão zoom. |
| Estados (J4) | Carregando: barra de progresso verde logo abaixo da barra escura, sobre o esqueleto do post. Vazio: Coliseu em círculo escuro, "A arquibancada está vazia", **Publicar foto** e **Buscar atletas**. Carregando mais: barra de progresso no fim. Fim: cartão "Chegou ao fim / Que tal compartilhar a sua?" com Publicar. Erro: "Feed indisponível" com **Tentar de novo**. |

Restrições mantidas: só dados reais (sem modalidade no post, que não tem esse campo), sem moedas, sem ranking ou atividades fictícias. "Quem você segue" vem de `GET /users/{id}/following`, que já existe.

---

## Parte A — Web (`web/`)

### A1. Componentes shadcn/ui (Base UI, estilo `base-nova`)
- Adicionados pelo CLI, sem dependências fora do `@base-ui/react` já instalado: **Slider**, **Toggle Group** e **Progress**. O CLI trouxe `radix-ui` e um pacote `cn` e importou `cn` do lugar errado; isso foi revertido. As variantes do Toggle ficaram em `toggle-variants.ts`, sobre o Base UI, e os seletores `data-horizontal`/`data-vertical` viraram `data-[orientation=…]`, que é o que o Base UI emite. O **Input Group** não foi necessário: a busca usa o campo existente com ícone.
- Reaproveitar `Tabs`, `Button`/`IconButton`, `PersonRow`, `EmptyState` (estrutura) e `feedbackVariants` existentes. Não duplicar o `Chip`.

### A2. Comunidade (`SocialCommunity.tsx` dividido)
- **Barra** (em `SocialCommunity`): barra escura fixa (sticky) com o Coliseu (`ArenaMark`, em menta), título, ➕ e abas (`Tabs` com uma variante escura nova). A linha do título recolhe ao rolar para baixo e volta ao rolar para cima, com `prefers-reduced-motion` respeitado. Na aba Atletas, mostra o campo de busca.
- **`CommunityFeed`**: `PostItem` com `layout="viewer"`, paginação por cursor com `IntersectionObserver` (como em `PostViewer`), estados J4 e "Tentar de novo".
- **Puxar para atualizar**: hook `usePullToRefresh(scrollEl, onRefresh)` com eventos de ponteiro e toque, limiar de cerca de 60 px, indicador com `role="status"` e sem disparar enquanto já carrega. Como o gesto não é acessível por teclado, há um botão "Atualizar feed" que só fica visível ao receber foco pelo Tab (decisão do usuário).
- **`CommunityPeople`**: busca `/users?q=` com debounce, cancelamento de respostas antigas e "Carregar mais atletas" por cursor; fileira "Quem você segue" a partir de `/users/{viewerId}/following`; seguir e deixar de seguir com as rotas atuais.
- Tocar em "Publicações" já ativa rola o feed para o topo.

### A3. Nova publicação (H5 + I5)
- **`PostComposer`**: tela cheia escura (`role="dialog"`, `useDialogFocus`, Esc fecha), escolha de arquivo com `validateImageFile`, passos Recorte → Legenda com indicador, "Continuar" e voltar, contador /2200 e "Publicar" com estado "Publicando…". O quadro "Nova foto" do perfil abre a Comunidade já com o compositor.
- **Recorte**: manter `react-easy-crop` (já instalado), com `rotation`, `zoom` controlado pelo Slider e pelo ToggleGroup, `aspect={1}`, Centralizar (crop `{x:0,y:0}`) e Redefinir (zoom 1, rotação 0).
- **`utils/cropImage.ts`**: aceitar `rotation` e desenhar a imagem girada no canvas antes de extrair a área. O servidor continua recebendo um quadrado (`normalize_post_image`), sem mudança de backend.
- `ImageCropSheet` continua servindo avatar e capa; a Comunidade deixa de usá-lo.

### A4. Post: proporção 1:1 e autor A5
- `PostItem`: mídia `aspect-square` nos dois layouts. Afeta a Comunidade e o visualizador "Publicações" do perfil; a grade da galeria já é quadrada.
- Autor A5: etiqueta de vidro com avatar sem borda (`SocialPhoto` ganha um tamanho sem contorno) e `@username`; data no início da legenda; ••• em círculo de vidro.

### A5. Testes e verificação
- Atualizar os testes da Comunidade e do post: abas, busca, seguir, estados vazio/erro/fim, publicar com recorte e legenda, puxar para atualizar (limiar) e Centralizar/Redefinir/girar.
- Checks da tabela de validação do `AGENTS.md` (lint, build e cobertura) e conferência no navegador a 320, 390 e 1440 px: barra recolhendo, puxar para atualizar, gaveta de publicação, ausência de overflow horizontal e foco visível.

## Parte B — Expo (`mobile/`)

Confirmado pelo usuário: o Expo entra nesta entrega. Mesma estrutura com `RefreshControl` (puxar para atualizar nativo), barra escura com abas (título recolhe ao rolar), aba Atletas com busca e fileira de quem você segue, estados J4, post 1:1 com autor A5 em `PostItem` (Comunidade e visualizador do perfil) e publicação em dois passos: o recorte é o editor nativo do `expo-image-picker` (`allowsEditing`, `aspect: [1, 1]`) e, em seguida, a tela escura de legenda com "Publicar".

O recorte I5 (atalhos, slider, girar, centralizar) **não** entra no Expo: exigiria dependências novas (`expo-image-manipulator` e gestos) e fica registrado como pendência.

## Fora do escopo
- Modalidade no post, sugestões de atletas, histórico de buscas e qualquer contagem que a API não forneça.
- Reprocessar posts existentes: já são quadrados no armazenamento.
