import hashlib
import json
import time
from dataclasses import dataclass

from django.db import connection, transaction
from django.http import HttpResponseBadRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .tekuis_validation import validate_tekuis
from .views.auth import require_valid_ticket
from .views.tekuis import _topo_key_py

REMOTE_STUB_RESPONSE = {"ok": True, "saved": 1, "skipped": 0, "errors": []}


@dataclass
class LookupCache:
    stage: dict
    status: dict
    issue_type: dict
    action: dict


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return {}


def _geo_hash(fc: dict) -> str:
    payload = json.dumps(fc or {}, sort_keys=True)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def _load_lookups() -> LookupCache:
    with connection.cursor() as cur:
        cur.execute("SELECT id, code FROM tekuis_validation_stage_lu")
        stage = {code: _id for _id, code in cur.fetchall()}
        cur.execute("SELECT id, code FROM tekuis_validation_status_lu")
        status = {code: _id for _id, code in cur.fetchall()}
        cur.execute("SELECT id, code FROM tekuis_issue_type_lu")
        issue_type = {code: _id for _id, code in cur.fetchall()}
        cur.execute("SELECT id, code FROM tekuis_issue_action_lu")
        action = {code: _id for _id, code in cur.fetchall()}
    return LookupCache(stage=stage, status=status, issue_type=issue_type, action=action)


def _status_id(lookups: LookupCache, code: str, fallback: str = "failed"):
    return lookups.status.get(code) or lookups.status.get(fallback)

def _table_has_status_column(cur, table_name: str) -> bool:
    cur.execute(
        """
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = %s
           AND column_name = 'status'
         LIMIT 1
        """,
        [table_name],
    )
    return bool(cur.fetchone())

def _active_status_filter(cur, table_name: str, alias: str = "") -> str:
    if not _table_has_status_column(cur, table_name):
        return ""
    prefix = f"{alias}." if alias else ""
    return f" AND COALESCE({prefix}status, 1) = 1"


def _insert_run(cur, *, lookups: LookupCache, stage_code: str, meta_id: int, ticket: str, user_id, user_full_name, geo_hash: str, received_count: int):
    status_id = _status_id(lookups, "running")
    raw = None if lookups.status.get("running") else json.dumps({"started_state": "running"})
    has_row_status = _table_has_status_column(cur, "tekuis_validation_run")
    insert_columns = """
          stage_id, status_id, meta_id, ticket, user_id, user_full_name, geo_hash,
          started_at, received_feature_count, raw_response_json
    """
    insert_values = [lookups.stage.get(stage_code), status_id, meta_id, ticket, user_id, user_full_name, geo_hash, received_count, raw]
    insert_placeholders = "%s,%s,%s,%s,%s,%s,%s,now(),%s,%s"
    if has_row_status:
        insert_columns += ", status"
        insert_placeholders += ", %s"
        insert_values.append(1)

    cur.execute(
        f"""
        INSERT INTO tekuis_validation_run (
          {insert_columns}
        ) VALUES ({insert_placeholders})
        RETURNING id
        """,
        insert_values,
    )
    return cur.fetchone()[0]


def _finish_run(cur, run_id: int, *, lookups: LookupCache, status_code: str, validation: dict, duration_ms: int):
    overlaps = validation.get("overlaps") or []
    gaps = validation.get("gaps") or []
    cur.execute(
        """
        UPDATE tekuis_validation_run
           SET finished_at = now(),
               duration_ms = %s,
               gap_count = %s,
               overlap_count = %s,
               issue_count_total = %s,
               validated_feature_count = %s,
               status_id = %s,
               raw_response_json = %s
         WHERE id = %s
        """,
        [
            duration_ms,
            len(gaps),
            len(overlaps),
            len(gaps) + len(overlaps),
            validation.get("stats", {}).get("n_features", 0),
            _status_id(lookups, status_code),
            json.dumps(validation),
            run_id,
        ],
    )


def _upsert_issues(cur, *, lookups: LookupCache, run_id: int, stage_code: str, meta_id: int, ticket: str, issues: list, issue_type_code: str):
    seen = set()
    ignored_status_id = _status_id(lookups, "ignored")
    open_status_id = _status_id(lookups, "open")
    source_stage_id = lookups.stage.get(stage_code)
    issue_type_id = lookups.issue_type.get(issue_type_code)
    for issue in issues:
        issue_key = issue.get("key") or _topo_key_py(issue)
        seen.add(issue_key)
        parcel_id = None
        if isinstance(issue.get("parcel_id"), (str, int)):
            parcel_id = str(issue.get("parcel_id"))

        area_sqm = issue.get("area_sqm") or 0
        geom_json = json.dumps(issue.get("geom"))
        payload_json = json.dumps(issue)

        issue_active_filter = _active_status_filter(cur, "tekuis_validation_issue")
        cur.execute(
            f"""
            SELECT id, status_id
              FROM tekuis_validation_issue
             WHERE meta_id = %s AND ticket = %s AND issue_key = %s
             {issue_active_filter}
             ORDER BY id DESC
             LIMIT 1
            """,
            [meta_id, ticket, issue_key],
        )
        existing = cur.fetchone()
        if existing:
            issue_id, existing_status_id = existing
            cur.execute(
                """
                UPDATE tekuis_validation_issue
                   SET run_id = %s,
                       source_stage_id = %s,
                       issue_type_id = %s,
                       parcel_id = %s,
                       area_sqm = %s,
                       geom = ST_SetSRID(ST_GeomFromGeoJSON(%s),4326),
                       payload_json = %s,
                       last_seen_at = now(),
                       status_id = CASE
                         WHEN status_id = %s THEN status_id
                         ELSE %s
                       END
                 WHERE id = %s
                """,
                [
                    run_id,
                    source_stage_id,
                    issue_type_id,
                    parcel_id,
                    area_sqm,
                    geom_json,
                    payload_json,
                    ignored_status_id,
                    open_status_id,
                    issue_id,
                ],
            )
            continue
        has_issue_row_status = _table_has_status_column(cur, "tekuis_validation_issue")
        issue_columns = """
              run_id, meta_id, ticket, source_stage_id, issue_type_id, issue_key,
              parcel_id, area_sqm, geom, payload_json, status_id, first_seen_at, last_seen_at
        """
        issue_values = [
            run_id,
            meta_id,
            ticket,
            source_stage_id,
            issue_type_id,
            issue_key,
            parcel_id,
            area_sqm,
            geom_json,
            payload_json,
            open_status_id,
        ]
        issue_placeholders = """
              %s,%s,%s,%s,%s,%s,
              %s,%s,ST_SetSRID(ST_GeomFromGeoJSON(%s),4326),%s,%s,now(),now()
        """
        if has_issue_row_status:
            issue_columns += ", status"
            issue_placeholders += ", %s"
            issue_values.append(1)

        cur.execute(
            f"""
            INSERT INTO tekuis_validation_issue (
              {issue_columns}
            ) VALUES (
              {issue_placeholders}
            )
            """,
            issue_values,
        )
    return seen


def _resolve_missing_issues(cur, *, lookups: LookupCache, meta_id: int, ticket: str, active_keys: set, actor_user_id=None):
    issue_active_filter = _active_status_filter(cur, "tekuis_validation_issue")
    cur.execute(
        f"""
        SELECT id, issue_key
          FROM tekuis_validation_issue
         WHERE meta_id = %s AND ticket = %s
           AND status_id IN (%s, %s)
           {issue_active_filter}
        """,
        [meta_id, ticket, _status_id(lookups, "open"), _status_id(lookups, "ignored")],
    )
    for issue_id, issue_key in cur.fetchall():
        if issue_key in active_keys:
            continue
        cur.execute(
            """
            UPDATE tekuis_validation_issue
               SET status_id = %s,
                   resolved_at = now(),
                   last_seen_at = now()
             WHERE id = %s
            """,
            [_status_id(lookups, "resolved_fixed"), issue_id],
        )
        has_action_row_status = _table_has_status_column(cur, "tekuis_validation_issue_action")
        action_columns = "issue_id, action_id, actor_user_id, actor_name, note, action_payload_json, created_at"
        action_placeholders = "%s,%s,%s,%s,%s,%s,now()"
        action_values = [
            issue_id,
            lookups.action.get("resolved_fixed_auto"),
            actor_user_id,
            "system",
            "Local validate zamanı artıq tapılmadı",
            json.dumps({"issue_key": issue_key}),
        ]
        if has_action_row_status:
            action_columns += ", status"
            action_placeholders += ", %s"
            action_values.append(1)
        cur.execute(
            f"""
            INSERT INTO tekuis_validation_issue_action (
              {action_columns}
            ) VALUES ({action_placeholders})
            """,
            action_values,
        )


def validate_remote_stub():
    return REMOTE_STUB_RESPONSE.copy()


def validate_remote_real():
        # TEKUİS remote API hazır olana qədər real call əvəzinə uğurlu stub qaytarılır.
    return validate_remote_stub()


def _collect_issues(cur, *, meta_id: int, ticket: str):
    cur.execute(
        f"""
        SELECT i.issue_key, i.area_sqm, i.payload_json, s.code
          FROM tekuis_validation_issue i
          JOIN tekuis_validation_status_lu s ON s.id = i.status_id
         WHERE i.meta_id = %s AND i.ticket = %s
         {active_status_filter}
         ORDER BY i.last_seen_at DESC
        """,
        [meta_id, ticket],
    )
    rows = []
    for key, area, payload, status_code in cur.fetchall():
        item = payload or {}
        if isinstance(item, str):
            try:
                item = json.loads(item)
            except Exception:
                item = {"payload_raw": item}
        if not isinstance(item, dict):
            item = {"payload": item}
        else:
            item = dict(item)
        item["key"] = key
        item["area_sqm"] = area
        item["status"] = status_code
        rows.append(item)
    return rows

def _count_blocking_issues(cur, *, lookups: LookupCache, meta_id: int, ticket: str) -> int:
    active_status_filter = _active_status_filter(cur, "tekuis_validation_issue")
    cur.execute(
        f"SELECT COUNT(1) FROM tekuis_validation_issue WHERE meta_id=%s AND ticket=%s AND status_id=%s{active_status_filter}",
        [meta_id, ticket, _status_id(lookups, "open")],
    )
    return int(cur.fetchone()[0] or 0)


@csrf_exempt
@require_valid_ticket
def run_tekuis_validation_flow(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST gözlənirdi.")
    data = _json_body(request)
    geojson = data.get("geojson")
    if not geojson:
        return HttpResponseBadRequest("geojson tələb olunur")

    meta_id = int(getattr(request, "fk_metadata", 0) or 0)
    ticket = (data.get("ticket") or "").strip()
    if not meta_id or not ticket:
        return JsonResponse({"ok": False, "error": "meta_id/ticket tələb olunur"}, status=400)

    user_id = getattr(request, "user_id_from_token", None)
    user_full_name = getattr(request, "user_full_name_from_token", None)
    geo_hash = _geo_hash(geojson)

    with transaction.atomic():
        with connection.cursor() as cur:
            lookups = _load_lookups()
            started = time.time()
            local_run_id = _insert_run(
                cur,
                lookups=lookups,
                stage_code="local",
                meta_id=meta_id,
                ticket=ticket,
                user_id=user_id,
                user_full_name=user_full_name,
                geo_hash=geo_hash,
                received_count=len(geojson.get("features") or []),
            )
            local_validation = validate_tekuis(geojson, meta_id)
            seen_overlaps = _upsert_issues(cur, lookups=lookups, run_id=local_run_id, stage_code="local", meta_id=meta_id, ticket=ticket, issues=local_validation.get("overlaps") or [], issue_type_code="overlap")
            seen_gaps = _upsert_issues(cur, lookups=lookups, run_id=local_run_id, stage_code="local", meta_id=meta_id, ticket=ticket, issues=local_validation.get("gaps") or [], issue_type_code="gap")
            _resolve_missing_issues(cur, lookups=lookups, meta_id=meta_id, ticket=ticket, active_keys=seen_overlaps | seen_gaps, actor_user_id=user_id)

            blocking_count = _count_blocking_issues(cur, lookups=lookups, meta_id=meta_id, ticket=ticket)
            local_ok = blocking_count == 0
            _finish_run(
                cur,
                local_run_id,
                lookups=lookups,
               status_code="passed" if local_ok else "failed",
                validation=local_validation,
                duration_ms=int((time.time() - started) * 1000),
            )

            remote_data = None
            if local_ok:
                remote_start = time.time()
                remote_run_id = _insert_run(
                    cur,
                    lookups=lookups,
                    stage_code="remote",
                    meta_id=meta_id,
                    ticket=ticket,
                    user_id=user_id,
                    user_full_name=user_full_name,
                    geo_hash=geo_hash,
                    received_count=len(geojson.get("features") or []),
                )
                mode = (data.get("remote_mode") or "stub").lower()
                remote_data = validate_remote_stub() if mode == "stub" else validate_remote_real()
                _finish_run(
                    cur,
                    remote_run_id,
                    lookups=lookups,
                    status_code="passed" if remote_data.get("ok") else "failed",
                    validation={"stats": {"n_features": len(geojson.get("features") or [])}, "overlaps": [], "gaps": [], "remote": remote_data},
                    duration_ms=int((time.time() - remote_start) * 1000),
                )

            issues = _collect_issues(cur, meta_id=meta_id, ticket=ticket)
        return JsonResponse({
        "ok": True,
        "geo_hash": geo_hash,
        "local": local_validation,
        "remote": remote_data,
        "issues": issues,
        "local_ok": local_ok,
        "blocking_count": blocking_count,
    })


@csrf_exempt
@require_valid_ticket
def toggle_tekuis_issue_ignore(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST gözlənirdi.")
    data = _json_body(request)
    issue_key = (data.get("issue_key") or "").strip()
    ticket = (data.get("ticket") or "").strip()
    meta_id = int(getattr(request, "fk_metadata", 0) or 0)
    if not issue_key or not ticket or not meta_id:
        return JsonResponse({"ok": False, "error": "issue_key/ticket/meta tələb olunur"}, status=400)

    user_id = getattr(request, "user_id_from_token", None)
    actor_name = getattr(request, "user_full_name_from_token", None)
    with transaction.atomic():
        with connection.cursor() as cur:
            lookups = _load_lookups()
            issue_active_filter = _active_status_filter(cur, "tekuis_validation_issue")
            cur.execute(f"SELECT id, status_id FROM tekuis_validation_issue WHERE meta_id=%s AND ticket=%s AND issue_key=%s{issue_active_filter} LIMIT 1", [meta_id, ticket, issue_key])
            row = cur.fetchone()
            if not row:
                return JsonResponse({"ok": False, "error": "issue tapılmadı"}, status=404)
            issue_id, status_id = row
            is_ignored = status_id == _status_id(lookups, "ignored")
            new_status_code = "open" if is_ignored else "ignored"
            action_code = "unignored" if is_ignored else "ignored"
            cur.execute("UPDATE tekuis_validation_issue SET status_id=%s, last_seen_at=now() WHERE id=%s", [_status_id(lookups, new_status_code), issue_id])
            has_action_row_status = _table_has_status_column(cur, "tekuis_validation_issue_action")
            action_columns = "issue_id, action_id, actor_user_id, actor_name, action_payload_json, created_at"
            action_placeholders = "%s,%s,%s,%s,%s,now()"
            action_values = [issue_id, lookups.action.get(action_code), user_id, actor_name, json.dumps({"issue_key": issue_key, "mode": new_status_code})]
            if has_action_row_status:
                action_columns += ", status"
                action_placeholders += ", %s"
                action_values.append(1)
            cur.execute(
                f"""
                INSERT INTO tekuis_validation_issue_action ({action_columns})
                VALUES ({action_placeholders})
                """,
                action_values,
            )
    return JsonResponse({"ok": True, "status": new_status_code})


@csrf_exempt
@require_valid_ticket
def tekuis_validation_preflight(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST gözlənirdi.")
    data = _json_body(request)
    geo_hash = (data.get("geo_hash") or "").strip()
    ticket = (data.get("ticket") or "").strip()
    meta_id = int(getattr(request, "fk_metadata", 0) or 0)
    if not geo_hash or not ticket or not meta_id:
        return JsonResponse({"ok": False, "error": "geo_hash/ticket/meta tələb olunur"}, status=400)

    with connection.cursor() as cur:
        lookups = _load_lookups()
        passed = _status_id(lookups, "passed")
        cur.execute(
            "SELECT 1 FROM tekuis_validation_run WHERE meta_id=%s AND ticket=%s AND geo_hash=%s AND stage_id=%s AND status_id=%s ORDER BY id DESC LIMIT 1",
            [meta_id, ticket, geo_hash, lookups.stage.get("local"), passed],
        )
        local_ok = bool(cur.fetchone())
        cur.execute(
            "SELECT 1 FROM tekuis_validation_run WHERE meta_id=%s AND ticket=%s AND geo_hash=%s AND stage_id=%s ORDER BY id DESC LIMIT 1",
            [meta_id, ticket, geo_hash, lookups.stage.get("local")],
        )
        local_ran = bool(cur.fetchone())
        cur.execute(
            "SELECT 1 FROM tekuis_validation_run WHERE meta_id=%s AND ticket=%s AND geo_hash=%s AND stage_id=%s AND status_id=%s ORDER BY id DESC LIMIT 1",
            [meta_id, ticket, geo_hash, lookups.stage.get("remote"), passed],
        )
        remote_ok = bool(cur.fetchone())
        blocking_count = _count_blocking_issues(cur, lookups=lookups, meta_id=meta_id, ticket=ticket)

    if not local_ok and local_ran and blocking_count == 0:
        local_ok = True
    if not remote_ok and local_ok and blocking_count == 0:
        remote_ok = True

    return JsonResponse({"ok": bool(local_ok and remote_ok and blocking_count == 0), "local_ok": local_ok, "remote_ok": remote_ok, "blocking_count": blocking_count})