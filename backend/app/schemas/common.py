from pydantic import BaseModel, ConfigDict


class StrictInput(BaseModel):
    """Request bodies reject unknown fields, so server-owned fields cannot be injected."""
    model_config = ConfigDict(extra='forbid')


class EmptyInput(StrictInput):
    """Body of actions without parameters: the client sends `{}` as JSON."""


class PersonOut(BaseModel):
    id: int
    name: str
    username: str
    avatar_url: str | None
