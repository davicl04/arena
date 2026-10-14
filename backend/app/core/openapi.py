"""Documentação da API no Swagger (`/docs`) e em `/openapi.json`.

Somente metadados: tags, resumos e descrições. Nada aqui altera caminhos, parâmetros, respostas ou o
comportamento das rotas; `document_operations` apenas completa o esquema OpenAPI já gerado pelo FastAPI.
As operações são identificadas por (método, caminho sem o prefixo `/api/v1`).
"""
from typing import Any

API_PREFIX = '/api/v1'

API_DESCRIPTION = """
API do **Arena**, plataforma de futebol, tênis e corrida amadores.

### Autenticação
- **Web:** `POST /api/v1/auth/login` com cabeçalho `Origin` grava a sessão em cookie `HttpOnly`
  (`arena_session`). Requisições de escrita feitas com o cookie só são aceitas de origens autorizadas (`403`).
- **Mobile:** sem `Origin`, o login devolve o `token` no corpo; envie-o em `Authorization: Bearer <token>`.
- Sem sessão válida, as rotas autenticadas respondem `401`. As rotas de **Administração** exigem conta
  administradora.

### Convenções
- **Escrita em JSON:** as requisições de escrita exigem `Content-Type: application/json` (`415` caso contrário).
  Não exigem corpo `DELETE`, logout e as ações curtir, seguir e bloquear. Os **uploads** (avatar, capa,
  publicação, brasão e comprovantes) usam `multipart/form-data`, com limite de **5 MiB** (`413` acima disso).
- **Erro de validação ou de regra:** `422` com `{ "detail": "...", "fields": [{ "field": "...", "message": "..." }] }`.
- **Conflito de estado:** `409` com `{ "detail": "..." }`.
- **Dados indisponíveis:** `503` com `{ "detail": "..." }`.
- As respostas não são guardadas em cache (`Cache-Control: no-store`).
""".strip()

SWAGGER_UI_PARAMETERS: dict[str, Any] = {
    'docExpansion': 'none',
    'filter': True,
    'defaultModelsExpandDepth': -1,
    'displayRequestDuration': True,
}

# A ordem desta lista é a ordem das seções no Swagger.
TAG_DESCRIPTIONS: tuple[tuple[str, str], ...] = (
    ('Sistema', 'Verificações de saúde do processo e do banco de dados.'),
    ('Autenticação', 'Cadastro (maiores de 18 anos), entrada e saída da conta.'),
    ('Conta e perfil', 'Dados da conta logada, nome de usuário, cidades, avatar, capa e privacidade.'),
    ('Perfis esportivos', 'Perfis privados por modalidade, estatísticas e linha do tempo esportiva.'),
    ('Usuários e seguidores', 'Busca de atletas, perfis, seguidores, pedidos para seguir e bloqueios.'),
    ('Publicações', 'Feed, publicações, curtidas e comentários.'),
    ('Denúncias', 'Denúncia de publicações, comentários e contas.'),
    ('Notificações', 'Notificações da conta, pendências e marcação de leitura.'),
    ('Ranking', 'Classificação por modalidade e posição do atleta logado.'),
    ('Times', 'Times, elenco, convites, link de convite e pedidos de entrada.'),
    ('Organizadores', 'Pedido da conta para se tornar organizadora de campeonatos.'),
    ('Campeonatos', 'Consulta de campeonatos e mensagens do campeonato.'),
    ('Gestão de campeonatos', 'Criação, envio para aprovação e acompanhamento dos campeonatos pelo organizador.'),
    ('Inscrições', 'Inscrição em campeonatos, comprovantes de pagamento e reembolso.'),
    ('Chaveamento', 'Chave do campeonato, agenda dos jogos e decisão de resultados pelo organizador.'),
    ('Matchmaking', 'Busca de partida, propostas recebidas e painel Jogar.'),
    ('Partidas', 'Partida: condições, reserva, cancelamento, W.O. e chat.'),
    ('Vagas e avulsos', 'Vagas em aberto nas partidas, ofertas de vaga e jogadores avulsos.'),
    ('Quadras', 'Consulta de quadras e sugestão de novas quadras.'),
    ('Resultados', 'Placar, presença e estatísticas individuais da partida, com revisão e contestação.'),
    ('Corridas', 'Registro de corridas, melhores marcas e provas.'),
    ('Administração', 'Rotas restritas a contas administradoras: filas de aprovação, moderação e disputas.'),
)
OPENAPI_TAGS: list[dict[str, str]] = [{'name': name, 'description': text} for name, text in TAG_DESCRIPTIONS]

# Por tag: (método, caminho, resumo).
_OPERATIONS: dict[str, tuple[tuple[str, str, str], ...]] = {
    'Sistema': (
        ('GET', '/health/live', 'Verificar se o processo está ativo'),
        ('GET', '/health/ready', 'Verificar se o banco e o esquema estão prontos'),
    ),
    'Autenticação': (
        ('POST', '/auth/register', 'Criar conta'),
        ('POST', '/auth/login', 'Entrar na conta'),
        ('POST', '/auth/logout', 'Sair da conta'),
    ),
    'Conta e perfil': (
        ('GET', '/me', 'Obter a conta logada'),
        ('PATCH', '/me', 'Atualizar a conta logada'),
        ('GET', '/me/username-availability', 'Verificar disponibilidade do nome de usuário'),
        ('GET', '/cities', 'Listar cidades'),
        ('PUT', '/me/avatar', 'Enviar avatar'),
        ('GET', '/me/avatar', 'Obter avatar'),
        ('DELETE', '/me/avatar', 'Remover avatar'),
        ('PUT', '/me/cover', 'Enviar capa'),
        ('GET', '/me/cover', 'Obter capa'),
        ('DELETE', '/me/cover', 'Remover capa'),
        ('GET', '/me/privacy', 'Obter configurações de privacidade'),
        ('PUT', '/me/privacy', 'Atualizar configurações de privacidade'),
    ),
    'Perfis esportivos': (
        ('GET', '/me/sports-profiles', 'Listar perfis esportivos'),
        ('PUT', '/me/sports-profiles/{sport}', 'Salvar perfil esportivo da modalidade'),
        ('GET', '/me/profile-stats', 'Obter estatísticas do perfil'),
        ('GET', '/users/{user_id}/timeline', 'Obter linha do tempo esportiva do usuário'),
    ),
    'Usuários e seguidores': (
        ('GET', '/users', 'Buscar usuários'),
        ('GET', '/users/{user_id}', 'Obter perfil de um usuário'),
        ('GET', '/users/{user_id}/avatar', 'Obter avatar de um usuário'),
        ('GET', '/users/{user_id}/cover', 'Obter capa de um usuário'),
        ('GET', '/users/{user_id}/mutual-followers', 'Listar seguidores em comum'),
        ('PUT', '/users/{user_id}/follow', 'Seguir usuário'),
        ('DELETE', '/users/{user_id}/follow', 'Deixar de seguir usuário'),
        ('GET', '/users/{user_id}/followers', 'Listar seguidores de um usuário'),
        ('GET', '/users/{user_id}/following', 'Listar quem um usuário segue'),
        ('GET', '/me/follow-requests', 'Listar pedidos para seguir recebidos'),
        ('PUT', '/me/follow-requests/{follower_id}', 'Responder pedido para seguir'),
        ('DELETE', '/me/followers/{follower_id}', 'Remover seguidor'),
        ('GET', '/me/blocks', 'Listar usuários bloqueados'),
        ('PUT', '/users/{user_id}/block', 'Bloquear usuário'),
        ('DELETE', '/users/{user_id}/block', 'Desbloquear usuário'),
    ),
    'Publicações': (
        ('GET', '/posts', 'Listar o feed'),
        ('POST', '/posts', 'Criar publicação'),
        ('GET', '/posts/{post_id}', 'Obter publicação'),
        ('PATCH', '/posts/{post_id}', 'Editar publicação'),
        ('DELETE', '/posts/{post_id}', 'Excluir publicação'),
        ('GET', '/posts/{post_id}/image', 'Obter imagem da publicação'),
        ('PUT', '/posts/{post_id}/like', 'Curtir publicação'),
        ('DELETE', '/posts/{post_id}/like', 'Remover curtida'),
        ('GET', '/posts/{post_id}/comments', 'Listar comentários'),
        ('POST', '/posts/{post_id}/comments', 'Criar comentário'),
        ('GET', '/comments/{comment_id}/avatar', 'Obter avatar do autor do comentário'),
        ('DELETE', '/comments/{comment_id}', 'Excluir comentário'),
        ('GET', '/users/{user_id}/posts', 'Listar publicações de um usuário'),
    ),
    'Denúncias': (
        ('POST', '/reports', 'Denunciar conteúdo ou conta'),
    ),
    'Notificações': (
        ('GET', '/me/notifications', 'Listar notificações'),
        ('GET', '/me/notifications/pending', 'Listar pendências'),
        ('GET', '/me/notifications/summary', 'Obter resumo de notificações'),
        ('GET', '/me/notifications/unread-count', 'Contar notificações não lidas'),
        ('PUT', '/me/notifications/read-all', 'Marcar todas como lidas'),
        ('PUT', '/me/notifications/{notification_id}/read', 'Marcar notificação como lida'),
    ),
    'Ranking': (
        ('GET', '/rankings', 'Listar classificação da modalidade'),
        ('GET', '/rankings/overview', 'Obter visão geral do ranking'),
        ('GET', '/me/standings', 'Obter minha classificação'),
    ),
    'Times': (
        ('POST', '/teams', 'Criar time'),
        ('GET', '/me/teams', 'Listar meus times'),
        ('GET', '/teams/{team_id}', 'Obter time'),
        ('PATCH', '/teams/{team_id}', 'Atualizar time'),
        ('POST', '/teams/{team_id}/close', 'Encerrar time'),
        ('PUT', '/teams/{team_id}/crest', 'Enviar brasão'),
        ('GET', '/teams/{team_id}/crest', 'Obter brasão'),
        ('DELETE', '/teams/{team_id}/crest', 'Remover brasão'),
        ('GET', '/teams/{team_id}/members', 'Listar elenco'),
        ('PATCH', '/teams/{team_id}/members/{user_id}', 'Atualizar integrante'),
        ('DELETE', '/teams/{team_id}/members/{user_id}', 'Remover integrante'),
        ('GET', '/teams/{team_id}/invite-candidates', 'Buscar atletas para convidar'),
        ('POST', '/teams/{team_id}/invites', 'Convidar atleta'),
        ('GET', '/teams/{team_id}/invites', 'Listar convites enviados'),
        ('DELETE', '/team-invites/{invite_id}', 'Cancelar convite'),
        ('GET', '/me/team-invites', 'Listar convites recebidos'),
        ('PUT', '/team-invites/{invite_id}', 'Responder convite'),
        ('GET', '/teams/{team_id}/invite-link', 'Obter link de convite'),
        ('POST', '/teams/{team_id}/invite-link', 'Gerar novo link de convite'),
        ('GET', '/join/{token}', 'Ver time pelo link de convite'),
        ('POST', '/join/{token}', 'Pedir entrada no time pelo link'),
        ('DELETE', '/team-join-requests/{request_id}', 'Cancelar pedido de entrada'),
        ('GET', '/teams/{team_id}/join-requests', 'Listar pedidos de entrada'),
        ('PUT', '/team-join-requests/{request_id}', 'Responder pedido de entrada'),
    ),
    'Organizadores': (
        ('GET', '/me/organizer-request', 'Consultar meu pedido de organizador'),
        ('POST', '/me/organizer-request', 'Pedir para ser organizador'),
        ('DELETE', '/me/organizer-request', 'Cancelar pedido de organizador'),
    ),
    'Campeonatos': (
        ('GET', '/events', 'Listar campeonatos'),
        ('GET', '/events/{event_id}', 'Obter campeonato'),
        ('GET', '/events/{event_id}/messages', 'Listar mensagens do campeonato'),
        ('POST', '/events/{event_id}/messages', 'Enviar mensagem no campeonato'),
    ),
    'Gestão de campeonatos': (
        ('GET', '/organizer/events', 'Listar meus campeonatos'),
        ('POST', '/organizer/events', 'Criar campeonato'),
        ('GET', '/organizer/events/{event_id}', 'Obter campeonato para gestão'),
        ('PATCH', '/organizer/events/{event_id}', 'Atualizar campeonato'),
        ('DELETE', '/organizer/events/{event_id}', 'Excluir campeonato'),
        ('POST', '/organizer/events/{event_id}/submit', 'Enviar campeonato para aprovação'),
        ('POST', '/organizer/events/{event_id}/withdraw', 'Retirar campeonato da aprovação'),
        ('POST', '/organizer/events/{event_id}/cancel', 'Cancelar campeonato'),
        ('GET', '/organizer/events/{event_id}/entries', 'Listar inscrições do campeonato'),
        ('GET', '/organizer/events/{event_id}/receipts', 'Listar comprovantes do campeonato'),
    ),
    'Inscrições': (
        ('GET', '/events/{event_id}/entries', 'Listar inscritos do campeonato'),
        ('POST', '/events/{event_id}/entries', 'Inscrever-se no campeonato'),
        ('GET', '/me/entries', 'Listar minhas inscrições'),
        ('GET', '/entries/{entry_id}', 'Obter inscrição'),
        ('DELETE', '/entries/{entry_id}', 'Cancelar inscrição'),
        ('PUT', '/entries/{entry_id}/receipt', 'Enviar comprovante de pagamento'),
        ('GET', '/entries/{entry_id}/receipts', 'Listar comprovantes da inscrição'),
        ('GET', '/receipts/{receipt_id}/file', 'Obter arquivo do comprovante'),
        ('POST', '/receipts/{receipt_id}/decision', 'Decidir sobre comprovante'),
        ('PUT', '/entries/{entry_id}/refund-receipt', 'Enviar comprovante de reembolso'),
        ('POST', '/entries/{entry_id}/refund-response', 'Responder ao reembolso'),
    ),
    'Chaveamento': (
        ('GET', '/events/{event_id}/bracket', 'Obter chaveamento do campeonato'),
        ('POST', '/organizer/events/{event_id}/bracket', 'Sortear chaveamento'),
        ('PATCH', '/organizer/events/{event_id}/bracket', 'Trocar posições no chaveamento'),
        ('POST', '/organizer/events/{event_id}/bracket/confirm', 'Confirmar chaveamento'),
        ('GET', '/organizer/events/{event_id}/matches', 'Listar jogos do campeonato'),
        ('PUT', '/organizer/matches/{match_id}/schedule', 'Agendar jogo do campeonato'),
        ('POST', '/organizer/matches/{match_id}/result-decision', 'Decidir resultado do jogo'),
    ),
    'Matchmaking': (
        ('POST', '/matchmaking/searches', 'Criar busca de partida'),
        ('GET', '/me/searches', 'Listar minhas buscas'),
        ('DELETE', '/matchmaking/searches/{search_id}', 'Cancelar busca'),
        ('GET', '/me/proposals', 'Listar propostas de partida'),
        ('PUT', '/matches/{match_id}/accept', 'Aceitar proposta de partida'),
        ('PUT', '/matches/{match_id}/decline', 'Recusar proposta de partida'),
        ('GET', '/me/play', 'Obter painel Jogar'),
        ('GET', '/me/matches', 'Listar minhas partidas'),
    ),
    'Partidas': (
        ('GET', '/matches/{match_id}', 'Obter partida'),
        ('POST', '/matches/{match_id}/terms', 'Propor condições da partida'),
        ('PUT', '/matches/{match_id}/terms/{terms_id}/accept', 'Aceitar condições da partida'),
        ('PUT', '/matches/{match_id}/booking', 'Registrar reserva da quadra'),
        ('POST', '/matches/{match_id}/cancel', 'Cancelar partida'),
        ('POST', '/matches/{match_id}/walkover', 'Registrar W.O.'),
        ('DELETE', '/matches/{match_id}/walkover', 'Retirar W.O.'),
        ('POST', '/matches/{match_id}/walkover/contest', 'Contestar W.O.'),
        ('GET', '/matches/{match_id}/messages', 'Listar mensagens da partida'),
        ('POST', '/matches/{match_id}/messages', 'Enviar mensagem na partida'),
    ),
    'Vagas e avulsos': (
        ('GET', '/me/slot-offers', 'Listar minhas ofertas de vaga'),
        ('PUT', '/match-slots/{slot_id}/accept', 'Aceitar oferta de vaga'),
        ('PUT', '/match-slots/{slot_id}/decline', 'Recusar oferta de vaga'),
        ('PUT', '/matches/{match_id}/slots', 'Atualizar vagas da partida'),
        ('DELETE', '/matches/{match_id}/guests/{user_id}', 'Remover avulso da partida'),
    ),
    'Quadras': (
        ('GET', '/courts', 'Listar quadras'),
        ('POST', '/courts/suggestions', 'Sugerir quadra'),
    ),
    'Resultados': (
        ('PUT', '/matches/{match_id}/result', 'Informar placar'),
        ('PUT', '/matches/{match_id}/attendance', 'Registrar presença'),
        ('GET', '/matches/{match_id}/stats', 'Listar estatísticas da partida'),
        ('PUT', '/matches/{match_id}/my-stats', 'Enviar minhas estatísticas'),
        ('PUT', '/matches/{match_id}/stats/{stat_id}/review', 'Revisar estatística'),
        ('POST', '/matches/{match_id}/stats/{stat_id}/contest', 'Contestar estatística'),
    ),
    'Corridas': (
        ('POST', '/me/runs/preview', 'Calcular prévia de uma corrida'),
        ('POST', '/me/runs', 'Registrar corrida'),
        ('GET', '/me/runs', 'Listar minhas corridas'),
        ('DELETE', '/me/runs/{run_id}', 'Excluir corrida'),
        ('GET', '/me/run-bests', 'Listar minhas melhores marcas'),
        ('GET', '/me/run-races', 'Listar minhas provas'),
    ),
    'Administração': (
        ('GET', '/admin/queue-counts', 'Contar itens das filas'),
        ('GET', '/admin/organizer-requests', 'Listar pedidos de organizador'),
        ('POST', '/admin/organizer-requests/{request_id}/decision', 'Decidir pedido de organizador'),
        ('GET', '/admin/organizers', 'Listar organizadores'),
        ('POST', '/admin/organizers/{organizer_id}/revoke', 'Revogar organizador'),
        ('GET', '/admin/events', 'Listar campeonatos em análise'),
        ('GET', '/admin/events/{event_id}', 'Obter campeonato em análise'),
        ('POST', '/admin/events/{event_id}/decision', 'Decidir sobre campeonato'),
        ('POST', '/admin/events/{event_id}/revocation-decision', 'Decidir revogação de campeonato'),
        ('GET', '/admin/court-suggestions', 'Listar sugestões de quadra'),
        ('POST', '/admin/court-suggestions/{court_id}/decision', 'Decidir sugestão de quadra'),
        ('GET', '/admin/refund-disputes', 'Listar disputas de reembolso'),
        ('POST', '/admin/entries/{entry_id}/refund-decision', 'Decidir disputa de reembolso'),
        ('GET', '/admin/walkover-disputes', 'Listar disputas de W.O.'),
        ('POST', '/admin/matches/{match_id}/walkover-decision', 'Decidir disputa de W.O.'),
        ('GET', '/admin/reports', 'Listar denúncias'),
        ('GET', '/admin/reports/{report_id}/image', 'Obter imagem da denúncia'),
        ('POST', '/admin/reports/{report_id}/decision', 'Decidir denúncia'),
        ('PUT', '/admin/users/{user_id}/status', 'Alterar situação da conta de um usuário'),
    ),
}

# Descrições explícitas, só onde agregam (substituem docstrings internas, que não são texto público).
DESCRIPTIONS: dict[tuple[str, str], str] = {
    ('GET', '/users/{user_id}/mutual-followers'): 'Contas que você segue e que também seguem o dono do perfil.',
    ('POST', '/auth/login'): ('Cria a sessão. Com cabeçalho `Origin` (navegador), grava o cookie `HttpOnly` '
                              '`arena_session`; sem `Origin` (mobile), devolve o `token` no corpo.'),
    ('PUT', '/me/avatar'): 'Envio em `multipart/form-data`, somente imagem, até 5 MiB.',
    ('PUT', '/me/cover'): 'Envio em `multipart/form-data`, somente imagem, até 5 MiB.',
    ('POST', '/posts'): 'Envio em `multipart/form-data` com a imagem e a legenda, até 5 MiB.',
    ('PUT', '/teams/{team_id}/crest'): 'Envio em `multipart/form-data`, somente imagem, até 5 MiB.',
    ('PUT', '/entries/{entry_id}/receipt'): 'Envio em `multipart/form-data`, imagem ou PDF, até 5 MiB.',
    ('PUT', '/entries/{entry_id}/refund-receipt'): 'Envio em `multipart/form-data`, imagem ou PDF, até 5 MiB.',
}

OPERATION_DOCS: dict[tuple[str, str], tuple[str, str]] = {}
for _tag, _items in _OPERATIONS.items():
    for _method, _path, _summary in _items:
        if (_method, _path) in OPERATION_DOCS:
            raise RuntimeError(f'Operação documentada duas vezes: {_method} {_path}')
        OPERATION_DOCS[(_method, _path)] = (_tag, _summary)


def document_operations(schema: dict[str, Any]) -> dict[str, Any]:
    """Aplica `tags`, `summary` e `description` às operações do esquema; não toca em mais nada."""
    for path, methods in schema.get('paths', {}).items():
        relative = path.removeprefix(API_PREFIX)
        for method, operation in methods.items():
            key = (method.upper(), relative)
            if key not in OPERATION_DOCS:
                continue
            operation['tags'], operation['summary'] = [OPERATION_DOCS[key][0]], OPERATION_DOCS[key][1]
            if key in DESCRIPTIONS:
                operation['description'] = DESCRIPTIONS[key]
    return schema
