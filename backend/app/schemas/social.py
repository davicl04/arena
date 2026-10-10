from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SocialInput(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PrivacyInput(SocialInput):
    social_public: bool


class CaptionInput(SocialInput):
    caption: str = Field(default='', max_length=2200)


class CommentInput(SocialInput):
    body: str = Field(min_length=1, max_length=1000)

    @field_validator('body', mode='before')
    @classmethod
    def trim_body(cls, value):
        return value.strip() if isinstance(value, str) else value


class ReportReason(StrEnum):
    spam = 'spam'
    assedio = 'assedio'
    conteudo_inadequado = 'conteudo_inadequado'
    outro = 'outro'


class ReportInput(SocialInput):
    target_type: str = Field(pattern='^(post|comment|user)$')
    target_id: int = Field(gt=0)
    reason: ReportReason
    description: str | None = Field(default=None, max_length=1000)


class ModerationInput(SocialInput):
    action: str = Field(pattern='^(dismiss|remove|suspend|reactivate)$')
    justification: str = Field(min_length=5, max_length=1000)

    @field_validator('justification', mode='before')
    @classmethod
    def trim_justification(cls, value):
        return value.strip() if isinstance(value, str) else value


class Page(BaseModel):
    items: list
    next_cursor: str | None


class SocialUserOut(BaseModel):
    id: int
    name: str
    avatar_url: str | None
    social_public: bool
    post_count: int
    follower_count: int
    following_count: int
    follows_you: bool = False
    follow_state: str = 'none'


class PostOut(BaseModel):
    id: int
    author: SocialUserOut
    caption: str
    image_url: str
    created_at: datetime
    like_count: int
    comment_count: int
    liked_by_me: bool
    can_edit: bool


class CommentOut(BaseModel):
    id: int
    author_id: int
    author_name: str
    author_avatar_url: str | None
    body: str
    created_at: datetime
    can_delete: bool


class FollowOut(BaseModel):
    user: SocialUserOut
    state: str


class ReportOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    reason: str
    description: str | None
    status: str
    created_at: datetime
    target_preview: dict | None = None
    target_user_id: int | None = None
    target_user_active: bool | None = None


class ModerationResult(BaseModel):
    report_id: int
    status: str
    action: str
