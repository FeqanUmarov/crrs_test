from django.conf import settings
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET

from .mssql import _mssql_connect, pyodbc

def _ensure_debug_mode():
    if not getattr(settings, "DEBUG", False):
        raise Http404

@require_GET
def debug_mssql(request):
    _ensure_debug_mode()
    rowid = request.GET.get("rowid")
    out = {
        "host": getattr(settings, "MSSQL_HOST", None),
        "port": getattr(settings, "MSSQL_PORT", None),
        "db": getattr(settings, "MSSQL_NAME", None),
        "user": getattr(settings, "MSSQL_USER", None),
        "driver": getattr(settings, "MSSQL_DRIVER", None),
        "encrypt": getattr(settings, "MSSQL_ENCRYPT", None),
        "trust_cert": getattr(settings, "MSSQL_TRUST_CERT", None),
        "schema": getattr(settings, "MSSQL_SCHEMA", "dbo"),
    }
    try:
        with _mssql_connect() as cn:
            cur = cn.cursor()
            cur.execute("SELECT DB_NAME(), SUSER_SNAME(), SCHEMA_NAME()")
            dbname, suser, schema = cur.fetchone()
            out.update({"connected": True, "server_db": dbname, "login": suser, "default_schema": schema})

            cur.execute(
                """
                SELECT COUNT(1) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'TBL_REQUEST_REG'
            """,
                (out["schema"],),
            )
            out["table_exists"] = bool(cur.fetchone()[0])

            if rowid:
                cur.execute(
                    f"SELECT COUNT(1) FROM {out['schema']}.TBL_REQUEST_REG WHERE ROW_ID = ?",
                    (int(rowid),),
                )
                out["row_exists_ROW_ID"] = bool(cur.fetchone()[0])
    except Exception as e:
        out.update({"connected": False, "error": str(e)})
    return JsonResponse(out)


@require_GET
def debug_odbc(request):
    _ensure_debug_mode()
    info = {
        "env_driver_from_settings": getattr(settings, "MSSQL_DRIVER", None),
        "drivers_on_system": [],
    }
    try:
        info["drivers_on_system"] = list(pyodbc.drivers())
    except Exception as e:
        info["drivers_error"] = str(e)
    return JsonResponse(info)