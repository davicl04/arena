# Arquitetura implementada na fundação e no módulo social

O desenho registra apenas a primeira entrega. Os diagramas PNG do roteiro permanecem referências do MVP futuro.

```mermaid
flowchart LR
    Web[React e Vite] -->|JSON e cookie HttpOnly| API[FastAPI]
    Mobile[React Native e Expo] -->|JSON e Bearer no SecureStore| API
    API --> Services[Identidade e autorização]
    Services --> DB[(PostgreSQL)]
    Services -->|S3 privado por API autenticada| Media[(MinIO local / storage S3)]
    Alembic[Migrações Alembic] --> DB
    Social[Autorização social e moderação] --> DB
    Social -->|Leitura privada com sessão| Media
```

```mermaid
erDiagram
    users ||--o{ auth_sessions : possui
    users ||--o{ sports_profiles : possui
    users ||--o{ media_objects : titular
    users o|--o| media_objects : avatar
    users ||--o{ posts : publica
    media_objects ||--o| posts : foto
    posts ||--o{ post_likes : recebe
    users ||--o{ post_likes : curte
    posts ||--o{ post_comments : recebe
    users ||--o{ post_comments : comenta
    users ||--o{ follows : segue
    users ||--o{ follows : alvo
    users ||--o{ user_blocks : bloqueia
    users ||--o{ user_blocks : bloqueado
    users ||--o{ content_reports : denuncia
    content_reports ||--o{ moderation_actions : decide
    cities ||--o{ sports_profiles : localiza
    users {
        int id PK
        string name
        string email UK
        date birth_date
        string password_hash
        boolean active
        boolean social_public "Privado por padrão"
        boolean is_admin "Concedido por comando explícito"
        datetime created_at
        datetime updated_at
        uuid avatar_media_id FK "Nullable"
    }
    media_objects {
        uuid id PK
        int user_id FK
        string bucket
        string object_key UK
        string content_type
        int size_bytes
        int width
        int height
        datetime created_at
    }
    auth_sessions {
        int id PK
        int user_id FK
        string token_hash UK
        datetime expires_at
        datetime created_at
    }
    cities {
        int id PK "Código IBGE"
        string name
        string state
    }
    sports_profiles {
        int id PK
        int user_id FK
        int city_id FK
        string sport "Único por usuário e modalidade"
        string position "Opcional e apenas futebol"
        boolean looking_for
        boolean is_public "Privado na fundação"
        datetime created_at
        datetime updated_at
    }
    posts {
        int id PK
        int user_id FK
        uuid media_id FK "Único"
        string caption "Até 2200 caracteres"
        datetime created_at
        datetime updated_at
    }
    post_likes {
        int id PK
        int post_id FK
        int user_id FK
        datetime created_at
    }
    post_comments {
        int id PK
        int post_id FK
        int user_id FK
        string body "Até 1000 caracteres"
        datetime created_at
    }
    follows {
        int id PK
        int follower_id FK
        int followed_id FK
        boolean approved
        datetime created_at
    }
    user_blocks {
        int id PK
        int blocker_id FK
        int blocked_id FK
        datetime created_at
    }
    content_reports {
        int id PK
        int reporter_id FK
        string target_type
        int target_id
        string reason
        string status
        datetime created_at
    }
    moderation_actions {
        int id PK
        int admin_id FK
        int report_id FK
        string target_type
        int target_id
        string action
        string justification
        datetime created_at
    }
```
