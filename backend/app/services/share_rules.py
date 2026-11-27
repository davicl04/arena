"""What an athlete can share as a result sticker (Stories): the single rule used by the profile timeline
(`shareable`) and by the sticker data routes (`/me/share/...`).

Contract: docs/decisoes/0007-compartilhamento-stories.md, section 2. Only the owner of the activity shares it:

- a match of the owner's history with a final result (`realizada` or `encerrada` with an outcome for the owner's
  side), except a walkover the owner won (the rival did not show up, so there is nothing to show);
- every run of the owner, on a standard distance or not;
- never a match without result (`sem_resultado`, an annulled walkover included) or a cancelled one.

Pure functions: the caller already loaded the match with the owner's side, or the run.
"""
from __future__ import annotations

from app.models.matches import Match
from app.models.runs import Run
from app.services.profile_history import outcome_of, valid_walkover_side


def match_shareable(viewer_id: int, owner_id: int, match: Match, owner_side: str | None) -> bool:
    """The viewer is the owner and the match has the owner's final result, other than a walkover win."""
    if viewer_id != owner_id or outcome_of(match, owner_side) is None:
        return False
    absent = valid_walkover_side(match)
    return absent is None or absent == owner_side


def run_shareable(viewer_id: int, run: Run) -> bool:
    """Every run is shareable by its owner and by nobody else."""
    return viewer_id == run.user_id


__all__ = ['match_shareable', 'run_shareable']
