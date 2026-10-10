# Plano: armazenamento de imagens e foto de perfil

Data: 9 de outubro de 2026. Plano para a próxima entrega; ainda não implementado.

## Objetivo

Permitir ao titular adicionar, recortar, substituir e remover a foto de perfil na web e no mobile. Imagens ficam em armazenamento de objetos privado; o PostgreSQL guarda a referência e os metadados necessários. A base deve poder ser reutilizada para brasões de times e imagens de publicações em entregas futuras.

Nesta etapa não entram posts, galeria, capa, brasões, perfil público ou infraestrutura de produção. O avatar não altera a privacidade atual do perfil.

## Decisões

- Usar MinIO local no Docker Compose, com volume persistente e bucket privado `arena-media`. Configuração e credenciais ficam no backend e em `.env` ignorado pelo Git; não expor credenciais ou URLs assinadas aos clientes.
- O repositório comunitário do MinIO foi arquivado e passou a distribuir a edição comunitária como código-fonte. Para desenvolvimento local, construir uma imagem a partir da versão fixada `RELEASE.2025-10-15T17-29-55Z`; registrar que produção exige decisão futura de provedor, suporte, hospedagem, HTTPS e backup. Fonte: [repositório oficial MinIO](https://github.com/minio/minio).
- Usar cliente S3 no backend para permitir compatibilidade com provedores futuros. O PostgreSQL guarda UUID, titular, bucket/chave opaca, MIME, tamanho, dimensões e data; não persiste URL presigned nem hostname do storage. A URL de leitura é derivada pela API.
- Upload passa pela API nesta versão. Aceitar JPEG, PNG e WebP estáticos, até 5 MiB e 25 megapixels. Validar o conteúdo decodificado, rejeitar arquivo inválido ou animado, corrigir orientação EXIF, remover metadados e normalizar para WebP quadrado de até 512 × 512 px, sem ampliar imagens menores.
- Recorte quadrado manual: controles de arrastar e zoom na web; seletor e editor nativo de recorte no Expo. Selecionar ou cancelar sem salvar preserva o avatar atual. Não incluir câmera.
- Fotos servidas por rota autenticada, sem URL pública ou token em query string. A versão do avatar na resposta serve somente para cache e não concede acesso. Web usa a sessão HttpOnly; mobile envia Bearer também ao buscar a imagem.

## Mudanças previstas

### Backend e infraestrutura

- Acrescentar serviço MinIO ao Compose em portas locais 9000/9001 e volume dedicado; manter o PostgreSQL e seu volume intactos. Preparar o bucket com comando idempotente explícito, sem criação automática durante o startup da API.
- Adicionar configuração de endpoint, região, bucket e credenciais e dependências fixadas do cliente S3 e Pillow nos arquivos de dependências e lock.
- Criar migração Alembic para entidade de mídia e referência nullable ao avatar do usuário; contas atuais continuam válidas sem imagem. Criar chave de objeto aleatória no servidor, nunca a partir do nome de arquivo fornecido pelo cliente.
- Adicionar `PUT /api/v1/me/avatar` (multipart; processa e substitui), `GET /api/v1/me/avatar?v={uuid}` (stream autenticado do avatar atual) e `DELETE /api/v1/me/avatar` (204, idempotente). Respostas de usuário, incluindo login e edição, acrescentam `avatar: { id, url } | null`, com caminho relativo à API.
- Ajustar middleware para aceitar multipart somente no endpoint de upload e liberar `DELETE` no CORS, preservando validação de Origin e autorização do titular. Limitar o corpo recebido antes do processamento.
- Retornar 413 para tamanho, 415 para formato, 422 para conteúdo inválido e 503 para storage indisponível, sem detalhes internos. Gravar o novo objeto antes de atualizar o vínculo; falha anterior ao commit mantém a imagem atual. Apagar a antiga após commit. Uma falha de limpeza não desfaz a troca e pode ser corrigida por comando de reconciliação que remove objetos sem vínculo com mais de 24 horas.

### Clientes

- Web: integrar `react-easy-crop`, com recorte quadrado, zoom e arraste, controles acessíveis por teclado e prévia circular. Converter o recorte para arquivo antes do envio.
- Mobile: adicionar `expo-image-picker` compatível com o SDK 57, uma imagem por vez e recorte quadrado nativo (`allowsEditing`). A API do cliente envia multipart sem definir manualmente o boundary.
- Incluir adicionar/trocar/remover na edição do perfil. Mostrar prévia, carregamento, erro recuperável e confirmação de sucesso; bloquear envio duplicado. Cancelamento ou falha preserva a imagem exibida anteriormente. Mostrar iniciais sem avatar ou em falha de carregamento e liberar URLs locais de prévia.
- Preservar o desenho aprovado e não preencher a aba Fotos com publicações nesta entrega.

## Verificação e aceite

- Backend: Ruff, testes unitários e integração PostgreSQL; testar migração/check Alembic e o serviço S3 com storage isolado no CI/local. Cobrir autorização, Origin, JPEG/PNG/WebP, extensão disfarçada, corrupção, animação, limites, EXIF, troca, remoção repetida, indisponibilidade, falhas entre upload/commit e reconciliação de órfãos.
- Web: lint, TypeScript, cobertura e build; validar 320, 390 e 1440 px, recorte por mouse/toque e teclado, cancelamento, falha, troca e remoção.
- Mobile: lint, typecheck, cobertura, exportação Android e `expo install --check`; conferir seletor/recorte em aparelhos Android/iOS disponíveis e registrar plataformas não verificadas. Export não conta como validação em aparelho.
- Fluxo de aceite: usuário A envia avatar na web e o vê no mobile; troca no mobile e confirma na web; recarrega e reinicia API/storage sem perda; remove e volta às iniciais. Usuário B não consegue ler nem remover o arquivo de A.
- Atualizar README, decisões técnicas, diagrama da fundação e `docs/situacao-fundacao.md` com implementação, checks executados e limitações quando a entrega for implementada. Este arquivo documenta apenas o plano.
