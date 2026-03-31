# crrs/views.py
from django.shortcuts import render, redirect
from django.views.decorators.csrf import ensure_csrf_cookie

from corrections.status_access import is_edit_allowed_status
from corrections.services.tekuis.topology_db import get_validation_state
from corrections.views.common.auth import _redeem_ticket_payload
from corrections.views.tekuis.tekuis import _has_active_tekuis

from corrections.views import _redeem_ticket_with_token


LOGIN_URL = "http://10.11.1.73:8085/login"

@ensure_csrf_cookie
def index(request):
    """
    Root səhifə:
      http://10.11.1.40:8085/?ticket=XXXX
    """
    ticket = (request.GET.get("ticket") or "").strip()


    if not ticket:
        return redirect(LOGIN_URL)


    fk, tok = _redeem_ticket_with_token(ticket)


    if not (fk and tok):
        return redirect(LOGIN_URL)
    
    initial_status_id = None
    initial_allow_edit = False
    initial_status_resolved = False

    payload = _redeem_ticket_payload(ticket, request=request)
    if payload:
        raw_status = payload.get("status", {}).get("value")
        try:
            initial_status_id = int(raw_status) if raw_status is not None else None
        except (TypeError, ValueError):
            initial_status_id = None
        initial_allow_edit = is_edit_allowed_status(initial_status_id)
        initial_status_resolved = True

    validation_state = get_validation_state(int(fk))
    validation_state["meta_id"] = int(fk)
    validation_state["tekuis_saved"] = _has_active_tekuis(int(fk))
    return render(
        request,
        "index.html",
        {
            "ticket": ticket,
            "meta_id": fk,
            "validation_state": validation_state,
            "initial_status_payload": {
                "resolved": initial_status_resolved,
                "status_id": initial_status_id,
                "allow_edit": initial_allow_edit,
            },
        },
    )
