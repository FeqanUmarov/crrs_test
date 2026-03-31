from collections.abc import Iterable

# Edit/CRUD icazəsi verən ticket statusları.
# Nümunə: yalnız 7 statusunu açmaq üçün {7} edin.
EDIT_ALLOWED_STATUSES = {15}

# MSSQL TBL_REQUEST_REG.STATUS_ID üçün edit icazə statusları.
# Legacy davranış üçün 99 burada saxlanılıb.
MSSQL_EDIT_ALLOWED_STATUSES = {15, 99}


def _to_int_set(values: Iterable[int]) -> set[int]:
    out: set[int] = set()
    for value in values:
        try:
            out.add(int(value))
        except (TypeError, ValueError):
            continue
    return out


def is_edit_allowed_status(status_id) -> bool:
    try:
        sid = int(status_id)
    except (TypeError, ValueError):
        return False
    return sid in _to_int_set(EDIT_ALLOWED_STATUSES)


def is_mssql_edit_allowed_status(status_id) -> bool:
    try:
        sid = int(status_id)
    except (TypeError, ValueError):
        return False
    return sid in _to_int_set(MSSQL_EDIT_ALLOWED_STATUSES)