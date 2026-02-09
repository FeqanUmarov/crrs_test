# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.db import transaction

from .tekuis_validation import validate_tekuis
from .topology_validation_db import (
    clear_final_flags,
    ensure_topology_validation_table,
    has_final,
    insert_validation_rows,
    mark_final_for_ignored_gaps,
    reset_current_status,
)


def _normalize_keys(values: Iterable[Any] | None) -> set[str]:
    if not values:
        return set()
    return {str(v) for v in values if v is not None}


def _build_rows(
    *,
    meta_id: int,
    validation_type: str,
    overlaps: List[Dict[str, Any]],
    gaps: List[Dict[str, Any]],
    ignored_gap_keys: set[str],
) -> Tuple[List[dict], int, int]:
    rows: List[dict] = []
    unignored_gaps = 0
    for _ in overlaps:
        rows.append(
            {
                "meta_id": meta_id,
                "error_type": "overlap",
                "validation_type": validation_type,
                "is_ignored": 0,
                "status": 1,
                "is_final": 0,
            }
        )
    for gap in gaps:
        gap_key = str(gap.get("hash") or gap.get("key") or "")
        is_ignored = 1 if gap_key and gap_key in ignored_gap_keys else 0
        if not is_ignored:
            unignored_gaps += 1
        rows.append(
            {
                "meta_id": meta_id,
                "error_type": "gap",
                "validation_type": validation_type,
                "is_ignored": is_ignored,
                "status": 1,
                "is_final": 0,
            }
        )
    return rows, len(overlaps), unignored_gaps


def _insert_final_marker(meta_id: int, validation_type: str) -> None:
    insert_validation_rows(
        [
            {
                "meta_id": meta_id,
                "error_type": "gap",
                "validation_type": validation_type,
                "is_ignored": 1,
                "status": 1,
                "is_final": 1,
            }
        ]
    )


def _record_validation(
    *,
    meta_id: int,
    validation_type: str,
    overlaps: List[Dict[str, Any]],
    gaps: List[Dict[str, Any]],
    ignored_gap_keys: set[str],
) -> bool:
    reset_current_status(meta_id, validation_type)
    clear_final_flags(meta_id, validation_type)
    rows, overlap_count, unignored_gaps = _build_rows(
        meta_id=meta_id,
        validation_type=validation_type,
        overlaps=overlaps,
        gaps=gaps,
        ignored_gap_keys=ignored_gap_keys,
    )
    insert_validation_rows(rows)

    success = overlap_count == 0 and unignored_gaps == 0
    if success:
        if gaps:
            mark_final_for_ignored_gaps(meta_id, validation_type)
        else:
            _insert_final_marker(meta_id, validation_type)
    return success


def _simulate_tekuis_validation() -> Dict[str, Any]:
    return {
        "stats": {"n_features": 0, "overlap_count": 0, "gap_count": 0},
        "overlaps": [],
        "gaps": [],
    }


def run_two_stage_validation(
    *,
    geojson: Dict[str, Any],
    meta_id: int,
    ignored_gap_keys: Optional[Iterable[Any]] = None,
) -> Dict[str, Any]:
    ensure_topology_validation_table()
    ignored_gap_keys_set = _normalize_keys(ignored_gap_keys)
    local_validation = validate_tekuis(geojson, meta_id)

    with transaction.atomic():
        local_success = _record_validation(
            meta_id=meta_id,
            validation_type="LOCAL",
            overlaps=local_validation.get("overlaps") or [],
            gaps=local_validation.get("gaps") or [],
            ignored_gap_keys=ignored_gap_keys_set,
        )

        if not local_success:
            reset_current_status(meta_id, "TEKUIS")
            clear_final_flags(meta_id, "TEKUIS")
            return {
                "meta_id": meta_id,
                "validation": local_validation,
                "local_final": False,
                "tekuis_final": False,
            }

        tekuis_validation = _simulate_tekuis_validation()
        _record_validation(
            meta_id=meta_id,
            validation_type="TEKUIS",
            overlaps=tekuis_validation.get("overlaps") or [],
            gaps=tekuis_validation.get("gaps") or [],
            ignored_gap_keys=set(),
        )

    return {
        "meta_id": meta_id,
        "validation": local_validation,
        "local_final": True,
        "tekuis_final": True,
    }


def get_validation_state(meta_id: int) -> Dict[str, Any]:
    ensure_topology_validation_table()
    return {
        "meta_id": int(meta_id),
        "local_final": has_final(meta_id, "LOCAL"),
        "tekuis_final": has_final(meta_id, "TEKUIS"),
    }


def validate_save_allowed(meta_id: int) -> Tuple[bool, Dict[str, Any]]:
    state = get_validation_state(meta_id)
    allowed = state["local_final"] and state["tekuis_final"]
    return allowed, state