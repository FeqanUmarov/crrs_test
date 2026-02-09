# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Iterable

from corrections.tekuis_topology_db import (
    VALIDATION_TYPE_LOCAL,
    VALIDATION_TYPE_TEKUIS,
    get_validation_state,
    insert_success_record,
    insert_validation_rows,
    mark_final_for_ignored_gaps,
    reset_latest_status,
)
from corrections.tekuis_validation import validate_tekuis


def _normalize_ignored_gap_keys(keys: Iterable[str] | None) -> set[str]:
    if not keys:
        return set()
    return {str(k) for k in keys if k is not None and str(k).strip() != ""}


def _count_non_ignored_gaps(gaps: list[dict], ignored_keys: set[str]) -> int:
    count = 0
    for gap in gaps:
        gap_key = str(gap.get("hash") or gap.get("key") or "").strip()
        if gap_key and gap_key not in ignored_keys:
            count += 1
    return count


def _apply_validation_results(
    *,
    meta_id: int,
    validation_type: str,
    overlaps: list[dict],
    gaps: list[dict],
    ignored_gap_keys: set[str],
) -> dict[str, bool]:
    reset_latest_status(meta_id, validation_type)

    overlaps_count = len(overlaps)
    gaps_count = len(gaps)

    insert_validation_rows(
        meta_id=meta_id,
        validation_type=validation_type,
        rows=[{"error_type": "overlap", "is_ignored": 0, "is_final": 0} for _ in overlaps],
    )
    gap_rows = []
    for gap in gaps:
        gap_key = str(gap.get("hash") or gap.get("key") or "").strip()
        gap_rows.append(
            {
                "error_type": "gap",
                "is_ignored": 1 if gap_key and gap_key in ignored_gap_keys else 0,
                "is_final": 0,
            }
        )
    insert_validation_rows(
        meta_id=meta_id,
        validation_type=validation_type,
        rows=gap_rows,
    )

    non_ignored_gaps = _count_non_ignored_gaps(gaps, ignored_gap_keys)
    stage_success = overlaps_count == 0 and non_ignored_gaps == 0

    if stage_success:
        if gaps_count > 0:
            mark_final_for_ignored_gaps(meta_id, validation_type)
        else:
            insert_success_record(meta_id, validation_type)

    return {"stage_success": stage_success}


def _simulate_tekuis_validation() -> dict[str, list[dict]]:
    return {"overlaps": [], "gaps": []}


def run_tekuis_validation(
    *,
    geojson: dict,
    meta_id: int,
    min_overlap_sqm: float | None = None,
    min_gap_sqm: float | None = None,
    ignored_gap_keys: Iterable[str] | None = None,
) -> dict:
    ignored_set = _normalize_ignored_gap_keys(ignored_gap_keys)

    validation = validate_tekuis(
        geojson,
        meta_id,
        min_overlap_sqm=min_overlap_sqm,
        min_gap_sqm=min_gap_sqm,
        use_ignored_table=False,
    )

    overlaps = validation.get("overlaps") or []
    gaps = validation.get("gaps") or []

    local_result = _apply_validation_results(
        meta_id=meta_id,
        validation_type=VALIDATION_TYPE_LOCAL,
        overlaps=overlaps,
        gaps=gaps,
        ignored_gap_keys=ignored_set,
    )

    if local_result["stage_success"]:
        tekuis_validation = _simulate_tekuis_validation()
        _apply_validation_results(
            meta_id=meta_id,
            validation_type=VALIDATION_TYPE_TEKUIS,
            overlaps=tekuis_validation.get("overlaps") or [],
            gaps=tekuis_validation.get("gaps") or [],
            ignored_gap_keys=set(),
        )

    state = get_validation_state(meta_id)

    return {
        "meta_id": int(meta_id),
        "local_final": state["local_final"],
        "tekuis_final": state["tekuis_final"],
        "validation": validation,
    }