# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Iterable, Sequence

from django.db import connection


TABLE_SQL = """
CREATE TABLE IF NOT EXISTS topology_validation (
  topo_id BIGSERIAL PRIMARY KEY,
  meta_id INTEGER NOT NULL,
  error_type TEXT NOT NULL,
  validation_type TEXT NOT NULL,
  is_ignored INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0,
  is_final INTEGER NOT NULL DEFAULT 0
);
"""

INDEX_SQL = [
    """CREATE INDEX IF NOT EXISTS topology_validation_meta_type_idx
       ON topology_validation (meta_id, validation_type);""",
    """CREATE INDEX IF NOT EXISTS topology_validation_final_idx
       ON topology_validation (meta_id, validation_type, is_final);""",
]


def ensure_topology_validation_table() -> None:
    with connection.cursor() as cur:
        cur.execute(TABLE_SQL)
        for stmt in INDEX_SQL:
            cur.execute(stmt)


def reset_current_status(meta_id: int, validation_type: str) -> None:
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE topology_validation
               SET status = 0
             WHERE meta_id = %s
               AND validation_type = %s
               AND status = 1
            """,
            [int(meta_id), validation_type],
        )


def clear_final_flags(meta_id: int, validation_type: str) -> None:
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE topology_validation
               SET is_final = 0
             WHERE meta_id = %s
               AND validation_type = %s
               AND is_final = 1
            """,
            [int(meta_id), validation_type],
        )


def insert_validation_rows(rows: Sequence[dict]) -> None:
    if not rows:
        return
    with connection.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO topology_validation (
                meta_id,
                error_type,
                validation_type,
                is_ignored,
                status,
                is_final
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    int(row["meta_id"]),
                    row["error_type"],
                    row["validation_type"],
                    int(row.get("is_ignored", 0)),
                    int(row.get("status", 0)),
                    int(row.get("is_final", 0)),
                )
                for row in rows
            ],
        )


def mark_final_for_ignored_gaps(meta_id: int, validation_type: str) -> None:
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE topology_validation
               SET is_final = 1
             WHERE meta_id = %s
               AND validation_type = %s
               AND error_type = 'gap'
               AND is_ignored = 1
               AND status = 1
            """,
            [int(meta_id), validation_type],
        )


def has_final(meta_id: int, validation_type: str) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT 1
              FROM topology_validation
             WHERE meta_id = %s
               AND validation_type = %s
               AND is_final = 1
             LIMIT 1
            """,
            [int(meta_id), validation_type],
        )
        return bool(cur.fetchone())