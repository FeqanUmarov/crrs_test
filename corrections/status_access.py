from django.db import connection


def is_edit_allowed_status(status_id) -> bool:
    try:
        sid = int(status_id)
    except (TypeError, ValueError):
        return False

    try:
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT is_edit
                FROM public.status_control
                WHERE status_id = %s
                LIMIT 1
                """,
                [sid],
            )
            row = cur.fetchone()
    except Exception:
        return False
    if not row:
        return False
    return bool(row[0])