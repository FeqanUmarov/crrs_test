import json
from typing import List

from django.db import connection, transaction
from django.http import HttpResponseBadRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from shapely import wkt as shapely_wkt

from .auth import _redeem_ticket, _unauthorized, require_valid_ticket
from .geo_utils import _clean_wkt_text, _payload_to_wkt_list
from .mssql import _is_edit_allowed_for_fk, _mssql_clear_objectid


TEKUIS_PARCEL_TABLE = "public.tekuis_parcel"
TEKUIS_PARCEL_OLD_TABLE = "public.tekuis_parcel_old"
GIS_DATA_TABLE = "public.gis_data"
ATTACH_FILE_TABLE = "public.attach_file"


def _soft_delete_table_by_meta_id(cur, table_name, meta_column, meta_id, *, touch_last_edited=False):
    update_parts = ["status = 0"]
    if touch_last_edited:
        update_parts.append("last_edited_date = NOW()")
    update_clause = ", ".join(update_parts)
    cur.execute(
        f"""
            UPDATE {table_name}
               SET {update_clause}
             WHERE {meta_column} = %s::int
               AND COALESCE(status, 1) <> 0
        """,
        [meta_id],
    )
    return cur.rowcount or 0


def _soft_delete_tekuis_current(cur, meta_id):
    cur.execute(
        f"""
            UPDATE {TEKUIS_PARCEL_TABLE}
               SET status = 0,
                   last_edited_date = NOW()
             WHERE meta_id = %s::int
               AND COALESCE(status, 1) <> 0
         RETURNING tekuis_id
        """,
        [meta_id],
    )
    return [row[0] for row in cur.fetchall()]


# ==========================
# PostGIS insert (save)
# ==========================
@require_valid_ticket
def save_polygon(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST gözlənirdi.")

    # Body oxu
    try:
        payload = getattr(request, "_json_cached", None) or json.loads(request.body.decode("utf-8"))
    except Exception:
        return HttpResponseBadRequest("Yanlış JSON.")

    # Auth/meta
    fk_metadata = getattr(request, "fk_metadata", None)
    if not fk_metadata:
        return JsonResponse({"ok": False, "error": "unauthorized"}, status=401)

    allowed, sid = _is_edit_allowed_for_fk(fk_metadata)
    if not allowed:
        return JsonResponse(
            {"ok": False, "error": "Bu müraciət statusunda GIS redaktə qadağandır.", "status_id": sid},
            status=403,
        )

    try:
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(1)
                  FROM gis_data
                 WHERE fk_metadata = %s
                   AND COALESCE(status, 1) = 1
            """,
                [fk_metadata],
            )
            active_cnt = cur.fetchone()[0] or 0

        if active_cnt > 0:
            return JsonResponse(
                {
                    "ok": False,
                    "code": "ALREADY_SAVED",
                    "fk_metadata": int(fk_metadata),
                    "message": "Məlumatlar artıq yadda saxlanılıb!",
                },
                status=409,
            )
    except Exception as e:
        return JsonResponse(
            {"ok": False, "error": "Məlumat yoxlaması alınmadı, əməliyyat dayandırıldı."}, status=500
        )

    # Bu nöqtəyə yalnız AKTİV sətir YOXDURsa gəlirik (yəni status=0-dır və ya ümumiyyətlə sətir yoxdur)

    # Giriş geometriyaları (WKT/GeoJSON)
    wkts_raw = _payload_to_wkt_list(payload)
    if (not wkts_raw) and payload.get("wkt"):
        wkts_raw = [_clean_wkt_text(str(payload["wkt"]))]

    if not wkts_raw:
        return HttpResponseBadRequest("wkt və/vəya geojson boşdur.")

    # MultiPolygon → Polygon-lara parçala
    single_polygon_wkts: List[str] = []
    for w in wkts_raw:
        if not w:
            continue
        try:
            g = shapely_wkt.loads(w)
        except Exception:
            continue
        if g.is_empty:
            continue
        gt = g.geom_type
        if gt == "Polygon":
            single_polygon_wkts.append(g.wkt)
        elif gt == "MultiPolygon":
            for sub in g.geoms:
                if sub and (not sub.is_empty):
                    single_polygon_wkts.append(sub.wkt)
        else:
            continue

    # Dublikatları at
    single_polygon_wkts = list(dict.fromkeys(single_polygon_wkts))
    if not single_polygon_wkts:
        return HttpResponseBadRequest("Yalnız (Multi)Polygon geometriyaları qəbul olunur.")

    replace = False

    uid = getattr(request, "user_id_from_token", None)
    ufn = getattr(request, "user_full_name_from_token", None)

    try:
        ids = []
        replaced_old = 0
        with transaction.atomic():
            with connection.cursor() as cur:
                if replace:
                    cur.execute(
                        """
                        UPDATE gis_data
                           SET status = 0, last_edited_date = NOW()
                         WHERE fk_metadata = %s
                           AND COALESCE(status,1) = 1
                    """,
                        [fk_metadata],
                    )
                    replaced_old = cur.rowcount or 0

                # İndi insert etmək olar (aktiv sətir yoxdur)
                for poly_wkt in single_polygon_wkts:
                    cur.execute(
                        """
                        INSERT INTO gis_data (fk_metadata, geom, status, user_id, user_full_name)
                        VALUES (%s, ST_GeomFromText(%s, 4326), 1, %s, %s)
                        RETURNING id
                    """,
                        [fk_metadata, poly_wkt, uid, ufn],
                    )
                    ids.append(cur.fetchone()[0])

        return JsonResponse(
            {
                "ok": True,
                "fk_metadata": int(fk_metadata),
                "inserted_count": len(ids),
                "ids": ids,
                "replaced_old": replaced_old if replace else 0,
            },
            status=200,
        )

    except Exception as e:
        return HttpResponseBadRequest(f"Xəta: {e}")


@csrf_exempt
@require_POST
def soft_delete_gis_by_ticket(request):
    ticket = request.GET.get("ticket") or request.POST.get("ticket")
    if not ticket:
        return HttpResponseBadRequest("ticket is required")

    meta_id = _redeem_ticket(ticket, request=request)
    if meta_id is None:
        return _unauthorized()

    # meta_id-i int-ə çevir ki, tip uyğunsuzluğu olmasın
    try:
        meta_id_int = int(meta_id)
    except Exception:
        return JsonResponse({"ok": False, "error": f"Bad meta_id: {meta_id!r}"}, status=400)

    with transaction.atomic():
        with connection.cursor() as cur:
            updated_rows = _soft_delete_tekuis_current(cur, meta_id_int)
            affected_parcel = len(updated_rows)

            affected_parcel_old = _soft_delete_table_by_meta_id(
                cur,
                TEKUIS_PARCEL_OLD_TABLE,
                "meta_id",
                meta_id_int,
            )

            # 2) GIS DATA
            affected_gis = _soft_delete_table_by_meta_id(
                cur,
                GIS_DATA_TABLE,
                "fk_metadata",
                meta_id_int,
                touch_last_edited=True,
            )


            # 3) ATTACH
            affected_attach = _soft_delete_table_by_meta_id(
                cur,
                ATTACH_FILE_TABLE,
                "meta_id",
                meta_id_int,
            )

        try:
            objectid_nullified = _mssql_clear_objectid(meta_id_int)
        except Exception:
            objectid_nullified = False

    return JsonResponse(
        {
            "ok": True,
            "meta_id": meta_id_int,
            "affected_parcel": affected_parcel,
            "affected_parcel_old": affected_parcel_old,
            "affected_gis": affected_gis,
            "affected_attach": affected_attach,
            "objectid_nullified": bool(objectid_nullified),
            "debug_tekuis_ids": updated_rows,
        }
    )