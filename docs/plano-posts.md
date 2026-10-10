# Posts, perfis sociais e moderação no ARENA

Data: 10 de outubro de 2026. Especificação definida com o usuário. As funcionalidades foram implementadas; o estado verificado, os checks e as limitações estão registrados em [situação da fundação](situacao-fundacao.md).

## Resumo

Implementar posts na web e no mobile, com uma foto quadrada obrigatória, legenda opcional, curtidas e comentários. A Comunidade terá um feed geral cronológico com conteúdo autorizado para o usuário logado.

A entrega inclui perfil social público ou privado, seguidores, aprovação de solicitações, bloqueio de contas, denúncias e painel administrativo web. Preservar a identidade visual aprovada e usar somente dados reais.

## Comportamento do produto

- **Publicação:** selecionar uma foto, recortar em 1:1, conferir a prévia e publicar. O sistema oferece ajuste de enquadramento e zoom antes da confirmação, redimensiona e otimiza a versão publicada e preserva a foto original no dispositivo. Legenda de até 2.200 caracteres. O autor pode editar a legenda ou excluir o post; substituir a foto fica fora desta versão.
- **Feed:** mostrar posts próprios, de contas públicas e de contas privadas que aprovaram o usuário como seguidor. Ordenar por data de criação, com paginação e atualização manual; editar a legenda não muda a posição.
- **Perfil social:** exibir nome, avatar, visibilidade, contagens de posts/seguidores/seguindo e galeria de posts autorizados. Perfis privados sem autorização mostram somente nome, avatar, indicação de privacidade e botão para solicitar acesso. E-mail, nascimento e dados dos perfis esportivos permanecem privados.
  > **Nota de 10/10/2026:** esta regra mudou com o [plano do perfil](plano-perfil.md), fase 1 do backend. As contagens de seguidores e seguindo passam a ser sempre visíveis a membros autenticados, inclusive em conta privada não seguida. O conteúdo continua fechado: `post_count` segue oculto sem permissão, e posts, comentários e listas de seguidores e seguindo continuam indisponíveis para quem não pode vê-los. O @ e a capa também ficam visíveis a usuários autenticados.
- **Seguidores:** seguir contas públicas imediatamente; solicitar acesso às privadas. Permitir cancelar pedido, aprovar/rejeitar, deixar de seguir e remover seguidores. Sem seguir a própria conta.
- **Privacidade:** contas atuais e novas começam privadas. Ao tornar pública, confirmar que todos os posts serão visíveis aos usuários logados e aprovar os pedidos pendentes. Ao tornar privada, manter seguidores já aprovados e restringir imediatamente posts e imagens.
- **Interações:** uma curtida por usuário/post; comentários de até 1.000 caracteres, sem respostas encadeadas. Autor do comentário ou dono do post pode excluí-lo. Exibir contagem de curtidas, sem lista nominal nesta versão. Comentar revela nome e avatar aos leitores daquele post, inclusive quando o comentarista tem conta privada.
- **Bloqueio:** impedir acesso e interações entre as duas contas, retirar vínculos e pedidos nos dois sentidos e ocultar suas interações uma da outra. Desbloquear não restaura vínculos.
- **Descoberta:** busca paginada por nome para encontrar contas; abrir perfil pelo autor de um post. Não incluir busca por e-mail.

## Implementação e contratos

### Backend e persistência

- Criar migração Alembic para visibilidade social da conta, posts, curtidas, comentários, relações de seguidores, bloqueios, denúncias, papel administrativo e registro de decisões de moderação. Preservar contas, avatares e volumes existentes.
- Manter `SportsProfile.is_public` separado da nova visibilidade social: esta entrega não publica os dados esportivos.
- Centralizar autorização para feed, perfil, detalhe, comentários, interações e imagens. Reavaliar visibilidade, vínculo, bloqueio e suspensão em cada requisição; identificadores e URLs não concedem acesso.
- Usar constraints para curtida única, vínculo único e proibição de seguir/bloquear a própria conta. Seguir, aprovar e curtir devem suportar reenvios sem duplicação.
- Paginar feed, galeria, comentários, seguidores, solicitações e denúncias por cursor; páginas padrão de 20 itens, máximo de 50. Feed e galeria usam data e ID como desempate.

Adicionar contratos sob `/api/v1`:

| Área | Interface prevista |
| --- | --- |
| Conta | Visibilidade social em `/me`; alteração em `/me/privacy`. |
| Perfil social | Busca `/users`, consulta `/users/{id}` e galeria `/users/{id}/posts`. |
| Posts | `/posts`: listagem e criação multipart; `/posts/{id}`: detalhe, edição de legenda e exclusão. |
| Interações | Curtida com `PUT/DELETE`; comentários com criação, listagem e exclusão. |
| Relações | Seguir/deixar de seguir, pedidos recebidos, aprovação/rejeição, listas autorizadas e remoção de seguidores. |
| Bloqueio e denúncia | Gestão em `/me/blocks`; criação de denúncias em `/reports`. |
| Administração | Fila e decisões em `/admin/reports`; suspensão e reativação de contas. |
| Imagens | Rotas autenticadas para foto do post e avatar social, com autorização correspondente. |

Respostas sociais usam tipos próprios com somente campos permitidos, sem reutilizar `UserOut`, que contém dados pessoais. Preservar cookie HttpOnly/Origin na web e Bearer/SecureStore no mobile. Conteúdo inexistente ou sem autorização retorna 404; sessão inválida retorna 401.

### Imagens

- Reutilizar MinIO/S3 privado e metadados existentes. Aceitar JPEG, PNG e WebP estáticos até 5 MiB e 25 megapixels.
- Validar pelo conteúdo, corrigir EXIF, remover metadados e armazenar WebP quadrado de até 1.080 px, sem ampliar imagens menores. Backend verifica o recorte quadrado.
- Publicar somente após upload e persistência bem-sucedidos. Falhas não deixam posts incompletos; excluir post revoga acesso antes da limpeza do objeto.
- Ampliar a reconciliação de órfãos para reconhecer vínculos de posts e avatares. Implementado: o reconciliador preserva ambos os tipos de mídia vinculados.
- Servir imagens pela API com `private, no-store`; nenhum bucket público, token em URL ou link presigned.

### Web, mobile e moderação

- Substituir o estado vazio da Comunidade pelo feed e adicionar criação, detalhe, comentários, perfil de terceiros e busca. Integrar a galeria à aba Fotos do perfil web.
- No Expo, acrescentar navegação entre Comunidade e Perfil, mantendo a interface existente; usar listas virtualizadas e seletor/recorte nativo. Não presumir paridade visual com a web.
- Oferecer configuração de privacidade, pedidos recebidos, seguidores e contas bloqueadas nos dois clientes. Preservar prévia/legenda quando o envio falhar; impedir envio duplicado enquanto estiver em andamento.
- Denúncias podem apontar para post, comentário ou conta, com motivo obrigatório: spam, assédio, conteúdo inadequado ou outro; descrição opcional de até 1.000 caracteres.
- Painel web restrito a administradores permite dispensar denúncia, remover conteúdo e suspender/reativar conta. Exigir justificativa e registrar administrador, alvo, ação e data. Nenhuma remoção automática pela quantidade de denúncias.
- Administradores podem consultar conteúdo privado denunciado exclusivamente na fila de revisão. Nomeação de administrador ocorre por comando administrativo explícito, nunca por cadastro ou edição comum da conta.
- Suspensão revoga sessões, impede novo login e oculta conteúdo da conta. Exclusão pelo autor ou remoção administrativa torna o conteúdo indisponível; guardar no histórico apenas referências e decisões, sem copiar fotos ou textos excluídos.

## Validação e sequência de entrega

1. Implementar e testar migração, privacidade, seguidores e bloqueios.
2. Implementar posts, armazenamento, feed e interações.
3. Integrar web e mobile à mesma API.
4. Implementar denúncias e painel administrativo.
5. Validar o fluxo completo e atualizar documentação.

Testes essenciais:

- Contas pública, privada, seguidora aprovada, pendente, bloqueada, suspensa e sem sessão; conferir acesso por feed, detalhe e URL direta da imagem.
- Mudanças público/privado, aprovação automática, remoção de seguidor, bloqueio/desbloqueio e revogação de acesso.
- Reenvios e concorrência em seguidores/curtidas; paginação sem duplicação; exclusão de post e permissões de comentários.
- Upload inválido, limites, EXIF, falha S3/commit e reconciliação preservando imagens vinculadas.
- Denúncia privada, permissões administrativas, registro de decisão e suspensão revogando sessões.
- Publicar na web, visualizar no mobile, comentar/curtir no mobile e conferir na web após recarregar. Confirmar persistência e isolamento entre contas.

Executar Ruff, testes backend com PostgreSQL/MinIO e Alembic upgrade/check; web lint, build e cobertura; mobile lint, typecheck, cobertura e export Android. Conferir web em 320, 390 e 1440 px e validar seletor, teclado e imagens em aparelhos disponíveis, registrando plataformas não verificadas. Se mudar dependências Expo, executar também `npx expo install --check`. Comandos e ambientes devem seguir o README e o AGENTS.md.

## Limites e documentação

Ficam fora: vídeos, carrossel, stories, mensagens diretas, notificações, hashtags, marcações, compartilhamento externo, recomendações algorítmicas e publicação na internet.

Atualizar decisões técnicas, diagrama, README e **`docs/situacao-fundacao.md`**, distinguindo funcionalidades entregues, checks executados e limitações. Não criar mocks, commits, push ou deploy nesta implementação sem solicitação.
