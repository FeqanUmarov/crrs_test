# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Iterable, Optional

from django.db import connection

VALIDATION_TYPE_LOCAL = "LOCAL"
VALIDATION_TYPE_TEKUIS = "TEKUİS"

VALIDATION_TABLE = "topology_validation"


def ensure_topology_validation_table() -> None:
    with connection.cursor() as cur:
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {VALIDATION_TABLE} (
              topo_id SERIAL PRIMARY KEY,
              meta_id INTEGER NOT NULL,
              error_type TEXT,
              validation_type TEXT NOT NULL,
              is_ignored INTEGER NOT NULL DEFAULT 0,
              status INTEGER NOT NULL DEFAULT 1,
              is_final INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            f"""
            CREATE INDEX IF NOT EXISTS {VALIDATION_TABLE}_meta_type_idx
            ON {VALIDATION_TABLE} (meta_id, validation_type, status);
            """
        )


def normalize_validation_type(value: str) -> str:
    normalized = str(value or "").strip()
    upper = normalized.upper()
    if upper == "TEKUIS" or normalized == VALIDATION_TYPE_TEKUIS:
        return VALIDATION_TYPE_TEKUIS
    if upper == VALIDATION_TYPE_LOCAL:
        return VALIDATION_TYPE_LOCAL
    return normalized


def reset_latest_status(meta_id: int, validation_type: str) -> None:
    ensure_topology_validation_table()
    validation_type = normalize_validation_type(validation_type)
    with connection.cursor() as cur:
        cur.execute(
            f"""
            UPDATE {VALIDATION_TABLE}
               SET status = 0,
                   is_final = 0
             WHERE meta_id = %s
               AND validation_type = %s
               AND status = 1
            """,
            [int(meta_id), validation_type],
        )


def insert_validation_rows(
    *,
    meta_id: int,
    validation_type: str,
    rows: Iterable[dict],
) -> None:
    rows = list(rows)
    if not rows:
        return
    ensure_topology_validation_table()
    validation_type = normalize_validation_type(validation_type)
    with connection.cursor() as cur:
        cur.executemany(
            f"""
            INSERT INTO {VALIDATION_TABLE}
              (meta_id, error_type, validation_type, is_ignored, status, is_final)
            VALUES
              (%s, %s, %s, %s, 1, %s)
            """,
            [
                [
                    int(meta_id),
                    row.get("error_type"),
                    validation_type,
                    int(row.get("is_ignored", 0)),
                    int(row.get("is_final", 0)),
                ]
                for row in rows
            ],
        )


def mark_final_for_ignored_gaps(meta_id: int, validation_type: str) -> None:
    ensure_topology_validation_table()
    validation_type = normalize_validation_type(validation_type)
    with connection.cursor() as cur:
        cur.execute(
            f"""
            UPDATE {VALIDATION_TABLE}
               SET is_final = 1
             WHERE meta_id = %s
               AND validation_type = %s
               AND error_type = 'gap'
               AND is_ignored = 1
               AND status = 1
            """,
            [int(meta_id), validation_type],
        )


def insert_success_record(meta_id: int, validation_type: str) -> None:
    insert_validation_rows(
        meta_id=meta_id,
        validation_type=normalize_validation_type(validation_type),
        rows=[{"error_type": None, "is_ignored": 0, "is_final": 1}],
    )


def get_validation_state(meta_id: int) -> dict[str, bool]:
    ensure_topology_validation_table()
    with connection.cursor() as cur:
        cur.execute(
            f"""
            SELECT
              EXISTS(
                SELECT 1
                  FROM {VALIDATION_TABLE}
                 WHERE meta_id = %s
                   AND validation_type = %s
                   AND status = 1
                   AND is_final = 1
              ) AS local_final,
              EXISTS(
                SELECT 1
                  FROM {VALIDATION_TABLE}
                 WHERE meta_id = %s
                   AND validation_type = %s
                   AND status = 1
                   AND is_final = 1
              ) AS tekuis_final
            """,
            [
                int(meta_id),
                VALIDATION_TYPE_LOCAL,
                int(meta_id),
                VALIDATION_TYPE_TEKUIS,
            ],
        )
        row = cur.fetchone() or (False, False)

    return {"local_final": bool(row[0]), "tekuis_final": bool(row[1])}