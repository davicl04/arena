# Refinamento do cabeçalho do perfil e do menu no ARENA

Data: 10 de outubro de 2026. Especificação definida com o usuário em quatro rodadas de protótipos interativos. Verificações e pendências da implementação ficam registradas em [situação da fundação](situacao-fundacao.md).

## Contexto

No perfil próprio, o nome real aparece como título e o `@` fica menor, em verde, logo abaixo. A edição abre por um lápis no avatar. No entanto, "Editar perfil" também reúne a seção Privacidade, com visibilidade da conta e contas bloqueadas, então o lápis promete menos do que a tela entrega. A engrenagem na capa abre Configurações, que contém apenas Notificações ("Em breve"), a versão do app, o painel de denúncias embutido (só para administradores) e "Sair da conta".

O protótipo de consulta foi publicado como artifact privado ("Perfil ARENA — protótipos"). Ele não é versionado e seus dados de exemplo não fazem parte do produto.

## Comportamento definido

1. **Identidade invertida.** O título (`h1`) passa a ser o nome de usuário com `@`, com o `@` em verde. O nome real fica embaixo, menor e em cinza. O cabeçalho é compartilhado por `ProfileHeader`, então a inversão vale para o perfil próprio e para o perfil de visitante.
2. **Entrada da edição.** O selo verde no avatar mantém posição e tamanho, mas troca o lápis pelo ícone **pessoa com engrenagem** (`UserCog`). O rótulo acessível continua "Editar perfil". A seção Privacidade continua dentro de Editar perfil.
3. **Hambúrguer.** A engrenagem da capa vira o ícone `Menu`, com rótulo acessível "Menu".
4. **Tela do menu** em página inteira, com título "Menu" e lista agrupada no padrão visual de Editar perfil:
   - *Conta*: Editar perfil e Minhas modalidades. São atalhos para telas que já existem.
   - *App*: Notificações ("Em breve", sem ação) e Sobre o ARENA (versão do app, sem ação).
   - *Moderação*: Denúncias. Aparece só para administradores e abre uma tela própria.
   - "Sair da conta" fica numa linha vermelha separada, no fim. Durante a saída, mostra "Aguarde…" e fica desabilitada.
5. **Moderação.** O painel `AdminReports` sai da tela de configurações e passa para a tela "Moderação". O componente e as chamadas à API não mudam; apenas o sobretítulo "MODERAÇÃO" sai do painel, porque passa a ser o título da tela.

Fora do escopo: nenhuma funcionalidade nova, nenhum contrato de API e nenhuma migração.

Atualização: depois da entrega web, o usuário pediu a adaptação ao Expo. O perfil próprio passou a ter o título @ e o hambúrguer, o perfil visitado (Comunidade) passou a ter o título @, e a folha "Menu" ganhou os grupos Conta e App e a saída. O selo usa o glifo ⚙, porque o mobile não tem biblioteca de ícones, e o grupo Moderação foi omitido, porque o Expo não tem painel de denúncias. Não há paridade visual garantida.

## Implementação (web)

1. **`web/src/components/ListRow.tsx`** (novo). Extrair o `Row` local de `EditProfilePage` para um componente reutilizável, com `Icon`, `label`, `value` opcional, `onClick` opcional, `tone?: 'danger'` e `disabled`. A versão com `onClick` é um `button` com chevron, e a versão sem ele é uma linha estática. A linha `danger` não mostra chevron. `EditProfilePage` passa a usar o componente.
2. **`ProfileHeader.tsx`**:
   - O `h1` passa a mostrar `<span className="profile-at">@</span>{username}`.
   - O nome real vai para `<p className="profile-name">`.
   - `Pencil` é substituído por `UserCog`.
   - O `aria-label` da região continua usando o nome real.
3. **`ProfilePage.tsx`**: `Settings` é substituído por `Menu`, com `aria-label="Menu"`, e o botão abre a tela `menu`.
4. **Telas e navegação** (`data/arena.ts` e `ArenaPage.tsx`):
   - `app-settings` é renomeada para `menu`, com o título "Menu".
   - Entra a tela `moderation`, com o título "Moderação".
   - As duas contam como aba Perfil ativa no cálculo de `activeNav`.
5. **`MenuPage.tsx`**: substitui `AppSettingsPage.tsx`, recebe callbacks explícitos (`onEditProfile`, `onSports`, `onModeration`, `onLogout`) e monta os grupos com `ListRow`.
6. **`AdminReports.tsx`**: remover o sobretítulo "MODERAÇÃO" e manter o `h2` "Denúncias" e o seletor de estado.
7. **`styles.css`**:
   - `.profile-at` em verde.
   - `.profile-name` com 12px, peso 500 e `var(--muted)`, no lugar de `.profile-handle`.
   - `.list-row.danger` com texto e ícone em vermelho acessível.
   - Espaçamento entre grupos consecutivos do menu.
8. **Testes** (`web/tests/navigation.test.tsx` e `social-regressions.test.tsx`):
   - O botão "Menu" abre a tela "Menu" com "Em breve", a versão e "Sair da conta".
   - O atalho Editar perfil abre a edição, e o atalho Minhas modalidades abre a tela Suas modalidades.
   - Denúncias aparece só para administradores e abre "Moderação".
   - O `@` é verificado pelo nome acessível do título.

## Verificação

- Em `web/`, rodar `npm run lint`, `npm run build` e `npm run test:coverage`.
- No navegador, com a API local quando disponível:
  - Perfil próprio e de visitante.
  - Nome e @ longos a 320 e 390 px, sem overflow horizontal.
  - Selo e menu operáveis pelo teclado, com foco visível.
  - Fluxo Menu → Editar perfil e Menu → Minhas modalidades, com retorno pelo Voltar.
  - Moderação com conta de administrador.
  - "Sair da conta".
