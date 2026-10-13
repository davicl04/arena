# Plano — tema claro e escuro (web + Expo)

> Estado: **implementado na web e no Expo em 13 de outubro de 2026** (decisões e desvios em [0004-tema.md](decisoes/0004-tema.md); verificações em [situação da fundação](situacao-fundacao.md)). O Expo não foi validado em aparelho.

## Contexto

Hoje a ARENA só tem tema claro, e não existe nenhuma infraestrutura de tema:

- **Não há tela "Configurações".** O lugar das preferências do app é o Menu do Perfil: [MenuPage.tsx](../web/src/pages/MenuPage.tsx), seção "App" (linhas 95-99), na web; e o `Sheet` do Menu em [ProfileScreen.tsx](../mobile/src/screens/ProfileScreen.tsx) (linha 312), no Expo.
- **Web.**
  - Os tokens ficam em `@theme static` de [ui.css](../web/src/ui.css), com cerca de 33 cores `--color-*`, e viram variáveis em `:root`.
  - A classe `.dark` e a variante `dark:` (`@custom-variant dark (&:is(.dark *))`) **já existem**, mas servem aos formulários sobre o vidro escuro (`sheet.tsx`, denúncias, `tabs`, `switch` e outros). Não podem ser reaproveitadas como tema global.
  - Fora dos tokens existem cerca de **537 utilitários `*-white`**, em 135 arquivos, e cerca de **160 cores arbitrárias `[#…]`**, em 65 arquivos.
  - [index.html](../web/index.html) fixa `theme-color` em `#005a36`.
- **Expo.**
  - [theme.ts](../mobile/src/theme.ts) exporta `colors` estático, importado em cerca de 149 arquivos. O `@theme` de [global.css](../mobile/global.css) repete os mesmos tokens para o NativeWind 5 (rc).
  - Há cerca de **600 cores literais** em `mobile/src`.
  - `app.json` força `"userInterfaceStyle": "light"`.
  - O `StatusBar` é fixo em `dark` no [App.tsx](../mobile/App.tsx).
  - Não há `AsyncStorage` instalado, só `expo-secure-store`.
- **Ícones de esporte.** Os PNGs de [web/public/images/sports/](../web/public/images/sports/) são RGB **sem canal alfa**, com traço escuro sobre fundo branco. [SportIcon.tsx](../web/src/components/SportIcon.tsx) usa `mix-blend-multiply`, então sobre fundo escuro o ícone some.
- **Backend.** Não há tabela nem coluna de preferências. O tema não precisa do servidor (ver Decisões).

## Decisões da sessão de protótipos

As decisões saíram de quatro rodadas de protótipos em 13 de outubro de 2026. O protótipo está no artefato privado do usuário https://claude.ai/artifact/5wmHmSCHZFFLtLGFS1uuYX. A fonte local fica em `artifacts/prototipos-tema/tema.src.html` (as rodadas anteriores em `tema-r1` a `tema-r3`), fora do versionamento.

| Parte | Decisão |
| --- | --- |
| Paleta do escuro | **Estádio à noite**: preto profundo esverdeado, um holofote suave no topo da tela, menta nos botões e o dourado dos elos (`--color-legend`, `#F4DE9A`) nos rótulos, nos ícones de quadro e no item selecionado. O **claro aprovado não muda**. |
| Controle | **Luzes do estádio**: cartão "Aparência" no Menu, logo antes do grupo "App". Mostra o Coliseu, o gramado e dois refletores, com três opções: **Dia**, **Noite** e **Automático**. Na Noite o céu escurece e os refletores acendem. |
| Cartões | **Borda iluminada**: degradê escuro (`#131d18` → `#0a110d`) com a borda de cima acesa (`#ffffff12`) e sem sombra. Ícones de esporte em branco. |
| Placas forest | **Forest como no claro**: a placa "Sua posição", a do Jogar e a do Salão continuam `--color-forest` (`#0b2218`), sem tratamento extra. |
| Navegação inferior | Mantida como no protótipo (assumida, sem objeção): barra preta translúcida com desfoque, item ativo com contorno claro e botão Jogar em menta com brilho leve. |

## Decisões assumidas (podem ser revistas antes da implementação)

Foram propostas durante a sessão e seguidas sem objeção. Confirme antes de implementar.

- **Três opções, com "Automático" como padrão.** Os valores internos são `light`, `dark` e `system`; na tela aparecem como Dia, Noite e Automático. Uma conta nova, ou um aparelho sem preferência salva, segue o sistema.
- **A preferência fica no aparelho, não na conta.**
  - Web: `localStorage`, chave `arena.tema`.
  - Expo: `expo-secure-store`, que já está instalado, com a mesma chave, para evitar uma dependência nova.
  - Não há migração, endpoint nem mudança de contrato. Cada aparelho guarda a própria escolha.
  - Não é um dado sensível, então não fere a regra de não gravar tokens no `localStorage`.
- **Escopo web e Expo**, com a web primeiro, como no plano dos toasts.
- **O tema vale também nas telas de entrada** (login, cadastro, recuperação), porque a preferência é do aparelho. Telas que já são escuras por design (Jogar, Salão dos Lendários, vidro dos formulários, toasts, faixa de conexão) continuam como estão nos dois temas.
- **Fotos e imagens de conteúdo não são alteradas** (posts, capas, avatares, "Perto de você"). Só os elementos de interface mudam.
- **Rótulo do cartão:**
  - Dia: "Jogo de dia".
  - Noite: "Jogo à noite".
  - Automático: "Automático · noite agora" ou "Automático · dia agora", conforme o sistema.

## Comportamento

1. **Primeira pintura sem piscar.** Um script em linha no `<head>` do `index.html` lê `arena.tema` com `try/catch`. Ele resolve `system` por `matchMedia('(prefers-color-scheme: dark)')` e grava `data-theme="dark"` ou `"light"` em `<html>` antes de o CSS carregar. Também ajusta `<meta name="theme-color">` (claro `#005a36`, escuro `#040806`) e `color-scheme`. Se o armazenamento falhar, vale o sistema.
2. **Troca pelo cartão.** A troca vale na hora, sem botão de salvar. A tela faz a transição de cor (cerca de 280 ms) só quando a troca vem do cartão. Não há transição na carga inicial nem na troca pelo sistema. Com `prefers-reduced-motion: reduce` não há transição, e os refletores do cartão mudam sem animação.
3. **Automático acompanha o sistema ao vivo.** Um ouvinte de `matchMedia` na web, e `Appearance` no Expo, troca o tema sem recarregar.
4. **Sem feedback extra.** Não há toast. O próprio cartão muda o título e o estado selecionado (`aria-pressed`), e o resultado é visível.
5. **Acessibilidade.**
   - As opções formam um `role="group"` com rótulo "Tema", são botões com `aria-pressed` e são acessíveis por teclado (Tab e Enter/Espaço).
   - A ilustração é decorativa (`aria-hidden`).
   - O foco visível no escuro usa `--color-focus` clareado (ver tokens).

## Tokens (web)

O escuro redefine os tokens existentes num bloco `:root[data-theme="dark"]`, depois do `@theme static`. Os utilitários do Tailwind 4 leem `var(--color-…)`, então trocar o valor muda todas as telas que já usam tokens. Os valores vêm do protótipo, e o contraste deve ser verificado na implementação (WCAG AA: 4,5:1 para texto e 3:1 para ícones e bordas de controle).

| Token | Claro (hoje) | Escuro (Estádio) | Observação |
| --- | --- | --- | --- |
| `--color-app` | `#e2e4e9` | `#040806` | Fundo do painel; recebe o holofote (abaixo). |
| `--color-ink` | `#495057` | `#d2dcd6` | |
| `--color-ink-muted` | `#626970` | `#87978e` | |
| `--color-line` | `rgba(73,80,87,.15)` | `#ffffff10` | |
| `--color-line-strong` | `#49505755` | `#ffffff30` | |
| `--color-subtle` | `#f1f2f5` | `#ffffff10` | Trilhos, fundos de selo. |
| `--color-field-border` | `#49505740` | `#ffffff24` | |
| `--color-placeholder` | `#747b82` | `#7d8b83` | Verificar contraste. |
| `--color-brand` | `#005a36` | `#8fe0b4` | Botão primário, contador, links. |
| `--color-brand-hover` | `#00482b` | `#a6ead0` | |
| `--color-focus` | `#b26c08` | `#e0a82e` | O dourado do Ouro aparece melhor sobre o preto. |
| `--color-danger-ink` | `#b42318` | `#ff8a80` | |
| `--color-error`, `-warning` e fundos `*-bg` | atuais | versões escuras dos mesmos tons | Definir na implementação, com contraste conferido. |
| `--shadow-card`, `--shadow-primary`, `--shadow-soft` | atuais | `none` | `--shadow-primary` vira o brilho `0 0 26px #8fe0b440`. |
| `--color-forest`, `night`, `glass`, `mint`, `legend`, `tier-*` | atuais | **iguais** | São escuros por design. |

Tokens novos (claro / escuro):

- `--color-surface`: `#fff` / `#0f1813`. Substitui o `bg-white` das superfícies.
- `--surface-sheen`: `none` / `linear-gradient(180deg, #131d18, #0a110d)`.
- `--surface-edge`: `transparent` / `#ffffff12`. É a borda iluminada, aplicada pelos primitivos de cartão.
- `--color-on-brand`: `#fff` / `#04100a`. É o texto sobre `bg-brand`; substitui o `text-white` desses pares.
- `--color-heading`: `var(--color-ink)` / `#fff`. Usado pelos `h1`–`h3` da camada base.
- `--color-tile` e `--color-tile-ink`: `#005a3612` e `brand` / `#f4de9a14` e `#f4de9a`. Usados no `IconTile` e no ícone do `ListRow`.
- `--color-eyebrow`: `ink-muted` / `#f4de9acc`.
- `--app-glow`: `none` / `radial-gradient(80% 30% at 50% -6%, #eafff31c, transparent 70%)`. É o holofote, aplicado só ao fundo do painel.

Os tokens `--ui-*` do shadcn em `:root` também ganham os valores escuros. O bloco `.dark` atual continua igual, para o vidro.

**Variante própria.** A variante `@custom-variant noite (&:where([data-theme="dark"], [data-theme="dark"] *))` serve aos poucos casos que não se resolvem com tokens. A variante `dark:` continua sendo a do vidro.

## Web

Arquivos e componentes previstos:

- `web/src/theme/` (ou `hooks/useTheme.ts` com um provider leve). Guarda a preferência (`light | dark | system`) e o tema resolvido, aplica `data-theme`, `theme-color` e `color-scheme` e ouve `matchMedia`. A transição usa uma classe temporária em `<html>`, removida depois de 300 ms. Leituras e escritas do `localStorage` ficam em `try/catch`.
- O script de inicialização vai em linha no [index.html](../web/index.html). Antes, verificar se algum cabeçalho CSP do servidor de produção bloqueia script em linha. Se bloquear, usar um hash.
- O componente novo `components/menu/AppearanceCard.tsx` desenha o cartão Luzes do estádio. O desenho fica em CSS: céu, sol, refletores com o feixe, o Coliseu por `ArenaMark` ou máscara, o gramado em faixas e o segmentado sobre vidro. Ele entra no [MenuPage.tsx](../web/src/pages/MenuPage.tsx) com o título "Aparência" (`ListHeading`), logo antes de "App". O segmentado pode usar `ToggleGroup` com o visual do protótipo, ou botões com `aria-pressed`.
- Primitivos ajustados primeiro, para que a maior parte das telas mude sozinha: `card.tsx`, `ListGroup` e `ListRow` de `list-row.tsx`, `button-variants.ts`, `badge.tsx`, `chip.tsx`, `icon-tile.tsx`, `eyebrow.tsx`, `field.tsx`, `sheet.tsx` (a folha clara), `empty-state.tsx`, `load-error.tsx`, `progress.tsx`, `person-row.tsx`, `separator.tsx` e a navegação inferior.
- **Ícones de esporte.**
  - Gerar uma única vez as versões com alfa (`web/public/images/sports/{futebol,tenis,corrida}-alfa.png`). O traço escuro vira opaco e o branco vira transparente, a partir dos PNGs atuais e sem mudar o desenho. Copiar também para o Expo.
  - No escuro, `SportIcon` troca o `<img>` multiplicado por um `<span>` com `mask-image` do PNG com alfa e `background: currentColor`, em branco nos cartões. No claro, continua como hoje.
  - O chip ativo mantém a inversão que já existe.
- **Varredura das cores fixas**, por área, na mesma ordem das etapas dos toasts:
  1. `bg-white` de superfície vira `bg-surface`, mais a borda acesa pelo primitivo.
  2. `text-white` sobre `bg-brand` vira `text-on-brand`.
  3. Branco sobre vidro, foto ou forest **fica** como está, porque é intencional.
  4. `[#…]` e `rgb()` viram tokens.
  5. O que sobrar e for exclusivo de um tema usa `noite:`.
- [Brand.tsx](../web/src/components/Brand.tsx): o ponto da marca usa `text-brand`, que vira menta no escuro, e o Coliseu usa `currentColor`. Não precisa mudar.

## Expo

- **Etapa de prova antes de migrar.** Confirmar no Android, com `npm run export:android` e um aparelho ou emulador, três pontos:
  - `Appearance.setColorScheme('light' | 'dark' | null)` (React Native 0.86) muda `useColorScheme()`.
  - O NativeWind 5 rc aplica valores escuros às variáveis do `@theme` (`@media (prefers-color-scheme: dark)` ou a variante `dark:` de esquema).
  - O desempenho da troca é aceitável.
  - Se o NativeWind não suportar o tema escuro, as classes de cor passam a ler um objeto de cores do contexto, e isso precisa ser registrado.
- [theme.ts](../mobile/src/theme.ts) passa a exportar `lightColors` e `darkColors`, com os mesmos nomes, mais `useThemeColors()`. Os usos de `colors.*` em props (cores de ícone, `placeholderTextColor`, `StyleSheet` em módulo) migram para o hook. Manter [global.css](../mobile/global.css) sincronizado, como manda o comentário do arquivo.
- `app.json`: `"userInterfaceStyle": "automatic"`. Ao mudar, rodar `npx expo install --check`.
- O `StatusBar` em [App.tsx](../mobile/App.tsx) passa a seguir o tema resolvido (`light` no escuro).
- A preferência fica no SecureStore, chave `arena.tema`. Enquanto a leitura não termina, vale o sistema, para não piscar a cor errada.
- O cartão "Aparência" entra no `Sheet` do Menu do Perfil, antes de "APP", com o mesmo desenho. A ilustração usa `View` e `react-native-svg` (já instalado, 15.15.4), com o Coliseu de `brand-svgs.ts`. Os refletores acendem com `react-native-reanimated` (já instalado). Com a redução de movimento ligada, mudam sem animação.
- Os ícones de esporte usam o PNG com alfa e `tintColor` no escuro.

## Ordem de implementação

1. **Web, infraestrutura:** tokens claro/escuro, tokens novos, variante `noite`, o hook de tema, o script do `index.html`, `theme-color` e `color-scheme`.
2. **Web, primitivos e navegação:** cartões com a borda acesa, botões, chips, campos, folha, `IconTile`, `ListRow` e a barra inferior com o botão Jogar.
3. **Web, cartão Aparência** no Menu e os **ícones de esporte** com alfa.
4. **Web, varredura das telas por área:** Início e perfil; Comunidade; Jogar e partida; Ranking; times e campeonatos; eventos e organizador; administração; entrada. Em cada área, conferir os dois temas.
5. **Expo, prova** do esquema de cores e do NativeWind; em seguida tokens, hook, `app.json`, `StatusBar` e o cartão no Menu.
6. **Expo, varredura das telas**, na mesma ordem da web.
7. **Documentação:** decisão `docs/decisoes/0004-tema.md` (a paleta escura amplia a paleta aprovada), [fidelidade-figma.md](fidelidade-figma.md) e [situacao-fundacao.md](situacao-fundacao.md).

Cada etapa tem um commit local, sem push, como nas orquestrações anteriores.

## Testes e validação

- **Web, testes unitários.**
  - O hook de tema resolve `system` pelo `matchMedia` e reage a `change`.
  - A preferência é gravada e lida em `arena.tema`.
  - Uma falha do `localStorage` não quebra nada.
  - O cartão marca a opção com `aria-pressed`, troca `data-theme` e mostra o título certo nos três casos.
- **Web, comandos** em `web/`: `npm run lint`, `npm run build` e `npm run test:coverage`.
- **Web, no navegador:**
  - Recarregar mantém a escolha, sem piscar.
  - O Automático segue o sistema ao vivo.
  - Revisão visual em 320, 390 e 1440 px nos dois temas, com navegação inferior, folhas, campos, foco visível e ausência de overflow horizontal.
- **Contraste:** conferir os pares de token do escuro (texto, texto suave, placeholder, foco, perigo, menta sobre preto e texto sobre menta).
- **Expo:** `npm run lint`, `npm run typecheck`, `npm run export:android`, `npm run test:coverage` (com teste do hook e da persistência) e `npx expo install --check` por causa do `app.json`. A build não comprova o funcionamento no aparelho; registrar se houve validação em Android.
- Não há mudança de backend, contrato ou migração.

## Riscos e pontos de atenção

- **Volume de cores fixas.** São cerca de 700 pontos na web e 600 no Expo. Os primitivos resolvem a maior parte, mas a varredura por área é longa. Não trocar branco intencional (sobre foto, vidro ou forest) por token.
- **Colisão com `.dark`.** O tema global usa só `data-theme` e a variante `noite`. A variante `dark:` continua sendo a do vidro.
- **Piscada na carga.** Sem o script em linha, a página nasce clara e escurece. Verificar a CSP de produção.
- **NativeWind 5 rc.** O suporte a variáveis por esquema de cor ainda não foi verificado nesta versão (ver a etapa de prova).
- **Ícones de esporte.** A versão com alfa precisa ser regenerada se os ícones provisórios forem trocados. Documentar o comando de geração.
- **Telas já escuras.** Jogar, Salão e o vidro devem ficar iguais nos dois temas. Conferir que não herdaram tokens que agora mudam (por exemplo, `text-ink` sobre `bg-forest`).
- **Novas telas.** A partir da implementação, toda tela nova precisa ser conferida nos dois temas. Vale registrar essa regra em `AGENTS.md` quando o tema existir.
