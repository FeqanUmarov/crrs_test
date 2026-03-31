import base64
import json
import logging
import time
from functools import wraps
from typing import Optional

import requests
from django.conf import settings
from django.http import JsonResponse

from ...status_access import is_edit_allowed_status

logger = logging.getLogger(__name__)


def _unauthorized(msg="unauthorized"):
    return JsonResponse({"ok": False, "error": msg}, status=401)


def _now_ms() -> int:
    # UTC vaxtını millisekundla qaytarır
    return int(time.time() * 1000)


def _coerce_exp_ms(exp_val) -> int | None:
    """Node-dan gələn exp həm saniyə (10^9), həm də millisekund (10^13) ola bilər.
    Saniyədirsə *1000, yoxdursa olduğu kimi qaytar.
    """
    try:
        v = int(exp_val)
    except Exception:
        return None
    # 10^12-dən kiçikdirsə, çox güman saniyədir
    return v * 1000 if v < 10**12 else v


def _resolve_redeem_auth_header(request=None) -> str:
    """Redeem üçün Authorization header qaytarır.

    Prioritet:
    1) gələn sorğudakı Authorization
    2) NODE_REDEEM_AUTH_HEADER
    3) NODE_REDEEM_BEARER
    """
    if request is not None:
        incoming = (
            request.headers.get("Authorization")
            or request.META.get("HTTP_AUTHORIZATION")
            or ""
        ).strip()
        if incoming:
            return incoming

    auth_header = (getattr(settings, "NODE_REDEEM_AUTH_HEADER", "") or "").strip()
    if auth_header:
        return auth_header

    bearer = (getattr(settings, "NODE_REDEEM_BEARER", "") or "").strip()
    if bearer:
        return f"Bearer {bearer}"

    return ""


def _redeem_ticket_payload(ticket: str, request=None):
    """Node redeem cavabının JSON payload-ını qaytarır."""
    url = str(getattr(settings, "NODE_REDEEM_URL", "") or "").strip().rstrip("/")
    if not url:
        logger.error("NODE_REDEEM_URL is empty; set it in .env")
        return None
    ticket = (ticket or "").strip()
    if not ticket:
        return None
    timeout = int(getattr(settings, "NODE_REDEEM_TIMEOUT", 8))
    prefer = (getattr(settings, "NODE_REDEEM_METHOD", "FORM") or "FORM").upper()
    headers = {"Accept": "application/json"}
    auth_header = _resolve_redeem_auth_header(request=request)
    if auth_header:
        headers["Authorization"] = auth_header
    def _parse(resp, mode: str):
        if resp.status_code != 200:
            logger.warning("redeem(%s) HTTP %s: %s", mode, resp.status_code, (resp.text[:300] if getattr(resp, "text", None) else ""))
            return None

        try:
            data = resp.json()
        except Exception:
            logger.warning("redeem(%s) JSON parse failed", mode)
            return None
        if data.get("valid", True) is False:
            return None
        return data

    def _post_form(key: str):
        try:
            resp = requests.post(
                url,
                data={key: ticket},
                headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
                timeout=timeout,
            )
            return _parse(resp, "payload/form")
        except Exception as e:
            logger.warning("redeem(payload) POST FORM (%s) failed: %s", key, e)
            return None

    def _post_json(key: str):
        try:
            resp = requests.post(
                url,
                json={key: ticket},
                headers={**headers, "Content-Type": "application/json"},
                timeout=timeout,
            )
            return _parse(resp, "payload/json")
        except Exception as e:
            logger.warning("redeem(payload) POST JSON (%s) failed: %s", key, e)
            return None

    def _get_qs(key: str):
        try:
            resp = requests.get(
                url,
                params={key: ticket},
                headers=headers,
                timeout=timeout,
                allow_redirects=False,
            )
            return _parse(resp, "payload/get")
        except Exception as e:
            logger.warning("redeem(payload) GET (%s) failed: %s", key, e)
            return None

    order_map = {
        "FORM": (_post_form, _post_json, _get_qs),
        "JSON": (_post_json, _get_qs, _post_form),
        "GET": (_get_qs, _post_form, _post_json),
    }
    order = order_map.get(prefer, order_map["FORM"])

    for fn in order:
        for key in ("ticket", "hash"):
            data = fn(key)
            if data:
                return data

    logger.error("redeem(payload) failed for ticket")
    return None


def _redeem_ticket_with_token(ticket: str, request=None):
    """
    Node redeem-dən həm fk_metadata (id), həm də token qaytarır.
    Token yoxdursa və ya vaxtı keçibsə -> (None, None).
    """
    data = _redeem_ticket_payload(ticket, request=request)
    if not data:
        return None, None

    tok = (data.get("token") or "").strip()
    exp_ms = _coerce_exp_ms(data.get("exp"))
    if not tok or exp_ms is None:
        return None, None
    if _now_ms() > exp_ms + int(getattr(settings, "NODE_REDEEM_EXP_SKEW_SEC", 15)) * 1000:
        return None, None

    rid = data.get("id") or data.get("rowid") or data.get("fk") or data.get("fk_metadata")
    try:
        return int(str(rid).strip()), tok
    except Exception:
        return None, None



def _extract_ticket(request) -> str:
    t = (
        request.POST.get("ticket")
        or request.GET.get("ticket")
        or request.headers.get("X-Ticket")
        or ""
    ).strip()
    if t:
        return t

    # JSON body-dən də yoxla
    ctype = (request.META.get("CONTENT_TYPE") or request.content_type or "").lower()
    if "application/json" in ctype:
        try:
            raw = request.body.decode("utf-8") if request.body else ""
            if raw:
                data = json.loads(raw)
                t2 = (data.get("ticket") or "").strip()
                if t2:
                    # istəsəniz reuse üçün saxlayıram
                    setattr(request, "_json_cached", data)
                    return t2
        except Exception:
            pass
    return ""


def _parse_jwt_user(tok: str) -> tuple[Optional[int], Optional[str]]:
    """
    JWT payload-ını imza yoxlamadan oxuyur və (user_id, full_name) qaytarır.
    Token payload nümunəsi: {"id": 2, "fullName": "..." , ...}

    Təhlükəsizlik qeydi:
    Bu funksiya yalnız transitional mərhələdə diaqnostika/kompat üçün saxlanılır.
    Buradan çıxan dəyərlər etibarlı identity hesab olunmamalıdır.
    """
    try:
        parts = (tok or "").split(".")
        if len(parts) < 2:
            return None, None
        b = parts[1]
        # base64url padding
        b += "=" * (-len(b) % 4)
        payload = json.loads(base64.urlsafe_b64decode(b).decode("utf-8"))
        uid = payload.get("id") or payload.get("userId") or payload.get("uid")
        try:
            uid = int(uid) if uid is not None else None
        except Exception:
            uid = None
        fullname = (
            payload.get("fullName")
            or payload.get("fullname")
            or payload.get("name")
            or payload.get("FullName")
        )
        if fullname is not None:
            fullname = str(fullname).strip()
        return uid, fullname
    except Exception:
        return None, None

def _resolve_identity_from_token(tok: str) -> tuple[Optional[int], Optional[str]]:
    """
    Signature verify edilməmiş JWT payload identity üçün etibarlı deyil.

    Phase-1 hardening: default olaraq user_id/full_name None qaytarılır ki,
    client-dən dəyişdirilə bilən claim-lər DB audit sahələrinə yazılmasın.
    Keçid dövründə köhnə davranışa müvəqqəti qayıtmaq üçün
    ALLOW_UNVERIFIED_JWT_IDENTITY=true aktiv edilə bilər.
    """
    if getattr(settings, "ALLOW_UNVERIFIED_JWT_IDENTITY", False):
        return _parse_jwt_user(tok)
    return None, None


def require_valid_ticket(view_fn):
    @wraps(view_fn)
    def _wrap(request, *args, **kwargs):
        ticket = _extract_ticket(request)
        fk, tok = _redeem_ticket_with_token(ticket, request=request)
        if not (fk and tok):
            return JsonResponse({"ok": False, "error": "unauthorized"}, status=401)

        request.fk_metadata = fk  # metadata id
        request.jwt_token = tok  # xammal JWT
        # İmza yoxlanmadan JWT claim-lərini trust etmirik.
        # Beləliklə audit user_id/full_name sahələrinə spoofed dəyər yazılmır.
        uid, fname = _resolve_identity_from_token(tok)
        request.user_id_from_token = uid
        request.user_full_name_from_token = fname

        return view_fn(request, *args, **kwargs)

    return _wrap

def _extract_status_id_from_payload(payload) -> Optional[int]:
    status_value = (payload.get("status") or {}).get("value")
    try:
        return int(status_value) if status_value is not None else None
    except (TypeError, ValueError):
        return None


def require_status_15(view_fn):
    @wraps(view_fn)
    def _wrap(request, *args, **kwargs):
        ticket = _extract_ticket(request)
        payload = _redeem_ticket_payload(ticket, request=request)
        if not payload:
            return JsonResponse({"ok": False, "error": "unauthorized"}, status=401)

        status_id = _extract_status_id_from_payload(payload)

        if not is_edit_allowed_status(status_id):
            return JsonResponse(
                {"ok": False, "error": "Bu əməliyyat üçün status icazəli deyil.", "status_id": status_id},
                status=403,
            )

        return view_fn(request, *args, **kwargs)

    return _wrap

def require_not_status_15(view_fn):
    @wraps(view_fn)
    def _wrap(request, *args, **kwargs):
        ticket = _extract_ticket(request)
        payload = _redeem_ticket_payload(ticket, request=request)
        if not payload:
            return JsonResponse({"ok": False, "error": "unauthorized"}, status=401)

        status_id = _extract_status_id_from_payload(payload)
        if is_edit_allowed_status(status_id):
            return JsonResponse(
                {"ok": False, "error": "Bu əməliyyat edit icazəsi olan statuslar üçün əlçatan deyil.", "status_id": status_id},
                status=403,
            )

        return view_fn(request, *args, **kwargs)

    return _wrap


def _redeem_ticket(ticket: str, request=None) -> Optional[int]:
    """
    Node redeem endpoint-ini çağırır və yalnız aşağıdakılar ödənərsə id qaytarır:
      - HTTP 200 + JSON parse OK
      - data.valid != False
      - token mövcuddur (boş deyil)
      - exp mövcuddur və _now_ms() < exp (+ kiçik saat fərqi buferi)
    Əks halda None.
    """
    ticket = (ticket or "").strip()
    if not ticket:
        return None

    url = str(getattr(settings, "NODE_REDEEM_URL", "") or "").strip().rstrip("/")
    if not url:
        logger.error("NODE_REDEEM_URL is empty; set it in .env")
        return None
    timeout = int(getattr(settings, "NODE_REDEEM_TIMEOUT", 8))
    prefer = (getattr(settings, "NODE_REDEEM_METHOD", "FORM") or "FORM").upper()

    require_token = bool(getattr(settings, "NODE_REDEEM_REQUIRE_TOKEN", True))
    skew_sec = int(getattr(settings, "NODE_REDEEM_EXP_SKEW_SEC", 15))  # kiçik saat fərqi buferi
    skew_ms = skew_sec * 1000


    base_headers = {"Accept": "application/json"}
    auth_header = _resolve_redeem_auth_header(request=request)
    if auth_header:
        base_headers["Authorization"] = auth_header

    def _parse_and_validate(resp) -> Optional[int]:
        if resp.status_code != 200:
            logger.warning("redeem HTTP %s: %s", resp.status_code, (resp.text[:300] if resp.content else ""))
            return None
        try:
            data = resp.json()
        except Exception:
            logger.warning("redeem JSON parse failed: %r", resp.text[:200])
            return None

        # valid=false isə rədd
        if data.get("valid", True) is False:
            logger.info("redeem: valid=false qaytdı")
            return None

        # token tələbi (default: tələb olunur)
        tok = (data.get("token") or "").strip()
        if require_token and not tok:
            logger.info("redeem: token yoxdur (require_token=True)")
            return None

        # exp yoxlaması
        exp_ms = _coerce_exp_ms(data.get("exp"))
        if exp_ms is None:
            logger.info("redeem: exp yoxdur/yolverilməz")
            return None
        now = _now_ms()
        if now > (exp_ms + skew_ms):
            logger.info(
                "redeem: token expiry keçib (now=%s, exp=%s, skew_ms=%s)",
                now,
                exp_ms,
                skew_ms,
            )
            return None

        # id götür
        rid = data.get("id") or data.get("rowid") or data.get("fk") or data.get("fk_metadata")
        try:
            return int(str(rid).strip())
        except Exception:
            logger.warning("redeem: 'id' parse olunmadı: %r", rid)
            return None

    def _post_form(key: str) -> Optional[int]:
        try:
            h = {**base_headers, "Content-Type": "application/x-www-form-urlencoded"}
            resp = requests.post(url, data={key: ticket}, headers=h, timeout=timeout)
            logger.info("redeem POST FORM %s → %s", key, resp.status_code)
            return _parse_and_validate(resp)
        except Exception as e:
            logger.warning("redeem POST FORM (%s) failed: %s", key, e)
            return None

    def _post_json(key: str) -> Optional[int]:
        try:
            h = {**base_headers, "Content-Type": "application/json"}
            resp = requests.post(url, json={key: ticket}, headers=h, timeout=timeout)
            logger.info("redeem POST JSON %s → %s", key, resp.status_code)
            return _parse_and_validate(resp)
        except Exception as e:
            logger.warning("redeem POST JSON (%s) failed: %s", key, e)
            return None

    def _get_qs(key: str) -> Optional[int]:
        try:
            resp = requests.get(
                url,
                params={key: ticket},
                headers=base_headers,
                timeout=timeout,
                allow_redirects=False,
            )
            logger.info("redeem GET %s → %s", key, resp.status_code)
            return _parse_and_validate(resp)
        except Exception as e:
            logger.warning("redeem GET (%s) failed: %s", key, e)
            return None

    order_map = {
        "FORM": (_post_form, _post_json, _get_qs),
        "JSON": (_post_json, _get_qs, _post_form),
        "GET": (_get_qs, _post_form, _post_json),
    }
    order = order_map.get(prefer, order_map["FORM"])

    for fn in order:
        for key in ("ticket", "hash"):
            rid = fn(key)
            if rid is not None:
                return rid

    logger.error("redeem failed for ticket (all attempts or token/exp invalid)")
    return None