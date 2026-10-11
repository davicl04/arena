# Plano — migração do visual para Tailwind CSS (web e Expo)

> Estado: **executado em 11 de outubro de 2026**, na branch `feat/tailwind-migrate`, sem commit. Web: etapas A0 a A4 concluídas; `styles.css` foi removido e o preflight está ligado. Expo: migrado para NativeWind 5.0.0-rc.0, versão candidata autorizada pelo usuário, sem teste em aparelho. Resultados e verificações estão na [situação da fundação](situacao-fundacao.md). O texto abaixo é o plano original, mantido como referência.
>
> Decisões tomadas na execução:
> - **shadcn/ui:** nenhum componente novo adotado. Button, Tabs e Sheet do preset não reduziriam código; o Sheet não usa `useDialogFocus` e o Tabs tem outro modelo de foco. Os primitivos próprios ficam em `web/src/components/ui/`.
> - **Ordenação automática de classes:** não feita, porque exige dependência nova.
> - **Mobile:** feito agora com a versão candidata, e não depois da etapa 10.
> - **Commits por etapa:** não feitos, porque commit está fora deste plano sem pedido.

## Contexto

| Cliente | Situação atual |
| --- | --- |
| Web | Tailwind CSS 4.3.3 já instalado com `@tailwindcss/vite`, mas carregado **sem preflight** em `web/src/ui.css` para não alterar o visual aprovado. Só o formulário de denúncias usa utilitários (componentes shadcn/ui em `web/src/components/ui/`). O restante do visual está em `web/src/styles.css`: 2.476 linhas, cerca de 435 regras e 6 media queries, com classes semânticas (`.glass*`, `.profile*`, `.social*`, `.post*`, `.sheet*` e outras). 37 arquivos de páginas e componentes usam `className`. |
| Expo | `StyleSheet.create` central em `mobile/src/components/ui.tsx` e cerca de 208 objetos `style={…}` inline espalhados nas telas e componentes. Cores repetidas como literais (`#005a36`, `#343d39`, `#e2e4e9`). Sem Tailwind. |

Hoje há convivência delicada: `styles.css` não está em camada e vence os utilitários do Tailwind; as regras globais de `label` e `input` precisaram excluir `[data-slot]`; e `--muted` significa cor de texto no ARENA e cor de fundo no shadcn (resolvido com tokens `--ui-*`). A migração elimina essas exceções.

## Objetivo e princípios

- Trocar o CSS escrito à mão por utilitários Tailwind e componentes reutilizáveis, **sem mudar o visual aprovado**. Não é um redesign: paleta, tipografia, espaçamentos e comportamento continuam iguais (ver [fidelidade visual](fidelidade-figma.md)).
- Migrar por área, com cada etapa pequena, verificável e reversível. A web continua funcionando entre as etapas.
- Uma única fonte de tokens (cores, fontes, raios, sombras, camadas), compartilhada com os componentes shadcn/ui.
- Acessibilidade preservada: foco visível, navegação por teclado, `prefers-reduced-motion`, sem overflow horizontal em 320 px.
- Sem dependências novas além das listadas aqui, cada uma com versão exata.

---

## Parte A — Web

### A0. Rede de segurança (antes de migrar qualquer tela)
- **Linha de base visual:** promover os scripts de navegador usados nos ensaios (Chrome headless por protocolo de depuração) para um roteiro de capturas reproduzível, salvo em `.local/e2e/`, que gera `artifacts/tailwind-baseline/` e `artifacts/tailwind-atual/`. Cobertura mínima, em 320, 390 e 1440 px: login e cadastro, Início, Arena/Jogar, Ranking, Comunidade (feed, busca, publicar), Notificações, Perfil (topo, rolado, abas, grade, Partidas), Publicações (vidros de comentários, ações, edição de legenda, exclusão, denúncia), perfil visitado (ações da conta), Menu, Editar perfil e suas folhas, Conexões, Contas bloqueadas e moderação (admin).
- **Comparação:** diferença por pixel entre as duas pastas, com relatório das telas que mudaram. Aceite: nenhuma diferença perceptível; diferenças de subpixel em texto são revisadas manualmente.
- **Testes independentes de classe CSS:** 8 consultas em `web/tests/` usam seletores de classe (por exemplo, `.is-condensed` da topbar). Elas passam a usar papéis, rótulos ou atributos `data-*` de estado (`data-condensed`), que sobrevivem à troca de classes.

### A1. Tokens no `@theme` (fonte única)
- Mover as variáveis de `:root` de `styles.css` para `@theme` em `web/src/ui.css`, com nomes sem colisão:

| Hoje | Token Tailwind | Uso |
| --- | --- | --- |
| `--green` `#005a36` | `--color-brand` | `bg-brand`, `text-brand` |
| `#495057` (texto base) | `--color-ink` | `text-ink` |
| `--muted` `#626970` | `--color-ink-muted` | `text-ink-muted` |
| `--line` | `--color-line` | `border-line` |
| `--app-bg` `#e2e4e9` | `--color-app` | `bg-app` |
| Inter / Sora | `--font-sans` / `--font-display` | `font-display` em títulos |

- Acrescentar as cores literais recorrentes (vidro `#08140eeb`, verde claro `#8fe0b4`, perigo `#b93749`, laranja do foco `#b26c08`), raios, sombras e a escala de camadas hoje espalhada (`z-index` 4, 12, 15, 19, 20, 25, 30, 40 e 41) como tokens nomeados (`--z-nav`, `--z-viewer`, `--z-sheet`, entre outros).
- Os tokens `--ui-*` do shadcn passam a apontar para esses tokens (`--ui-primary: var(--color-brand)`), mantendo a variação `.dark` do vidro.
- Variante para a largura do aplicativo (hoje `@media (max-width: 430px)`): `@custom-variant app-narrow (@media (max-width: 430px))`, para não depender dos breakpoints padrão.

### A2. Primitivos reutilizáveis
Antes de converter páginas, extrair os padrões repetidos em componentes com variantes (`class-variance-authority`, já instalado):

| Primitivo | Substitui |
| --- | --- |
| `Button` (primário, secundário, texto, perigo, vidro) e `IconButton` | `.primary`, `.secondary`, `.text-button`, `.icon-btn`, `.glass-primary`, entre outros |
| `Sheet` | `BottomSheet` + `.sheet*` (mantendo `useDialogFocus`) |
| `Tabs` | `ProfileTabs` + `.tabs` (mantendo a navegação por teclado atual) |
| `Glass` | `GlassPanel` + `.glass*` |
| `ListRow`, `PersonRow`, `Chip`, `Card`, `EmptyState` | blocos de lista, chips de modalidade e cartões |

- **shadcn/ui:** usar um componente shadcn somente quando ele reproduzir o visual aprovado e reduzir código (Button, Tabs e Sheet são candidatos). Cada adoção é comparada pela linha de base visual. Componentes shadcn adicionados vão para `web/src/components/ui/` pelo CLI, conferindo se `@/lib/utils` continua sendo o import de `cn`.
- Classes longas ficam dentro desses primitivos, e não repetidas nas páginas.

### A3. Migração por área
Ordem do menor risco para o maior. Em cada etapa: converter o JSX para utilitários, **apagar no mesmo passo** as regras correspondentes de `styles.css` (senão o CSS sem camada continua vencendo), comparar as capturas, rodar os checks e registrar em `situacao-fundacao.md`. Um commit por etapa.

| Etapa | Área | Arquivos principais |
| --- | --- | --- |
| 1 | Casca do app: `.app-shell`, `.arena-app`, `.screen`, navegação inferior e botão Jogar | `App.tsx`, `ArenaPage.tsx` |
| 2 | Autenticação | `AuthPage.tsx` |
| 3 | Início e cartões de modalidade | `HomePage.tsx`, `SportCard.tsx`, `SportIcon.tsx` |
| 4 | Ranking, Arena e estados vazios | `ArenaPage.tsx`, `EmptyState.tsx` |
| 5 | Menu, Notificações, Conexões e Contas bloqueadas | páginas homônimas, `ListRow.tsx`, `PersonRow.tsx` |
| 6 | Editar perfil e folhas | `EditProfilePage.tsx`, `EditSheets.tsx`, `BottomSheet.tsx`, `ImageCropSheet.tsx` |
| 7 | Cabeçalho, topbar, abas e grade do perfil | `ProfileHeader.tsx`, `ProfileTabs.tsx`, `ProfileGallery.tsx`, `ProfilePage.tsx`, `UserProfilePage.tsx` |
| 8 | Post, visualizador e vidros | `PostItem.tsx`, `PostViewer.tsx`, `PostComments.tsx`, `PostActions.tsx`, `GlassPanel.tsx`, `AccountActions.tsx`, `ReportForm.tsx` |
| 9 | Comunidade (feed, busca, publicação) | `SocialCommunity.tsx` |
| 10 | Moderação (admin) | `AdminReports.tsx` |

O que continua em CSS, por não caber bem em utilitários: `@font-face`/import das fontes, `@keyframes`, ocultação da barra de rolagem e alguns seletores complexos. Esses ficam em `ui.css`, dentro de `@layer base` ou `@layer components`. Container queries (`@container`), `:has()` (`has-*`), `env(safe-area-inset-*)` e `backdrop-filter` têm suporte em utilitários ou valores arbitrários.

### A4. Encerramento
- Com `styles.css` vazio, **ligar o preflight** (`@import "tailwindcss"`), remover `styles.css` e as exceções `:where(:not([data-slot]))` e `[aria-hidden="true"]` das regras globais e repetir a comparação visual completa.
- Opcional: ordenação automática de classes (`prettier-plugin-tailwindcss` ou regra ESLint equivalente). Só com aprovação, por ser dependência nova.
- Atualizar `docs/decisoes/0001-fundacao.md`, a [fidelidade visual](fidelidade-figma.md) e o README, se algum comando mudar.

### A5. Riscos e cuidados (web)
- **Cascata durante a convivência:** regra de `styles.css` que sobra sobre um elemento já convertido vence o utilitário. Por isso cada etapa apaga o CSS da área ao converter.
- **Classes dinâmicas:** o Tailwind só gera classes que aparecem inteiras no código. Nada de `bg-${cor}`; usar mapas de classes completas (como já se faz com as modalidades em `src/data/arena.ts`).
- **Estilos inline restantes:** valores realmente dinâmicos (URL da capa, posição de recorte) continuam em `style`.
- **Tamanho do CSS:** comparar o CSS de produção antes e depois. Hoje são cerca de 55 kB (11 kB comprimidos).

---

## Parte B — Expo: funcionaria para o mobile?

**Sim, mas não da mesma forma.** O Tailwind não roda nativamente no React Native. É preciso o **NativeWind**, que converte classes em estilos nativos. Há limitações importantes:

| Ponto | Situação em 11 de outubro de 2026 |
| --- | --- |
| Versão estável | NativeWind **4.2.7**, compatível com Expo SDK 57, mas baseado no **Tailwind 3** (configuração em `tailwind.config.js`). A web usa Tailwind 4 (configuração em CSS), então haveria duas sintaxes de tokens. |
| Versão com Tailwind 4 | NativeWind **5.0.0-rc.0** (candidata desde setembro de 2026), sobre `react-native-css`. Permitiria os mesmos tokens `@theme` da web, mas ainda não é estável. |
| Dependências novas | `nativewind`, `tailwindcss` (v3 na estável), `react-native-reanimated` e `react-native-worklets` (exigidos no SDK 57), além de `babel.config.js`, `metro.config.js`, `global.css` e tipos `nativewind-env.d.ts`. Hoje o app não tem nenhum desses arquivos nem o Reanimated. |
| O que não se compartilha | O markup. Web usa `div`/`button` e o app usa `View`/`Pressable`/`Text`, então as classes não são copiáveis 1:1. Também não há hover, CSS grid, `:has()`, seletores descendentes nem `backdrop-filter` (o desfoque exigiria `expo-blur`). Sombras se comportam de forma diferente em Android e iOS. |
| O que se compartilha | Tokens (cores, fontes, raios), nomes de classes utilitárias e o vocabulário de variantes dos primitivos. |
| Equivalente ao shadcn | `react-native-reusables` (componentes no estilo shadcn sobre NativeWind), opcional e separado da web. |
| Testes | Vitest com `react-test-renderer` e `react-native` simulado. Seria preciso configurar o JSX do NativeWind também no Vitest. Os testes atuais verificam rótulos e fluxos, não estilos, então tendem a continuar válidos. |

### Recomendação para o mobile
1. **Agora, sem dependência nova:** centralizar os literais de cor, fonte e raio em `mobile/src/theme.ts`, com os **mesmos nomes de token da web** (`brand`, `ink`, `ink-muted`, `line`, `app`), e trocar os literais nas telas. Isso já reduz duplicação e torna a migração futura mecânica.
2. **Prova de conceito isolada:** em branch própria, instalar o NativeWind e migrar uma tela pequena (`AuthScreen`), com lint, typecheck, testes, `export:android`, `npx expo install --check` e **teste em aparelho pelo Expo Go**, já que o build não comprova execução.
3. **Decisão de versão:** se o NativeWind 5 estiver estável, adotá-lo para compartilhar a sintaxe de tokens do Tailwind 4 com a web. Se a migração for urgente antes disso, usar o 4.2.7 com `tailwind.config.js` gerado a partir de `theme.ts`.
4. Só então migrar o restante (`ui.tsx`, componentes de post, telas), na mesma lógica de etapas da web e sem prometer paridade visual sem conferência em aparelho.

---

## Decisões pendentes do usuário
| Decisão | Recomendação |
| --- | --- |
| Quanto adotar do shadcn/ui na web | Só quando reproduzir o visual aprovado e reduzir código; começar por Button, Tabs e Sheet. |
| Momento do mobile | Fazer agora apenas o `theme.ts` (sem dependências); prova de conceito com NativeWind depois da etapa 10 da web ou quando o NativeWind 5 estiver estável. |
| Ordenação automática de classes | Opcional, ao final; exige dependência nova. |

## Fora deste plano
Mudanças de visual, de paleta ou de comportamento, novas funcionalidades, backend, commit ou push sem pedido.

## Verificação (cada etapa)
- **Web**, em `web/`: `npm run lint`, `npm run build` e `npm run test:coverage` (pisos de `docs/qualidade-codigo.md`); comparação de capturas da área em 320, 390 e 1440 px, sem overflow horizontal e com foco visível; fluxo afetado conferido no navegador com a API real.
- **Mobile**, em `mobile/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run export:android` e, ao mudar dependências Expo, `npx expo install --check`; para a prova de conceito, teste em aparelho.
- Registro em `docs/situacao-fundacao.md` a cada etapa, com o que foi migrado, as verificações executadas e as pendências.
