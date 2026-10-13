"""Walk-in offers (Jogar, fase 4; etapa 3): list of pending slot offers.

The slot, offer and match shapes are the shared ones of `app.schemas.matches` (`SlotOfferOut`, `MatchSlotOut`,
`MatchDetailOut`, `SlotsInput`); only the list envelope is new. Contract: docs/decisoes/0002-jogar.md, section 11.2.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.matches import SlotOfferOut


class SlotOfferList(BaseModel):
    """`GET /me/slot-offers`: the pending offers of the holder, the soonest to lapse first."""
    items: list[SlotOfferOut]
