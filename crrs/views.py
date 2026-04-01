# crrs/views.py
from django.shortcuts import render, redirect
from django.views.decorators.csrf import ensure_csrf_cookie

from corrections.services.tekuis.topology_db import get_validation_state
from corrections.views.tekuis.tekuis import _has_active_tekuis

from corrections.views import _redeem_ticket_with_token
from corrections.views.common.auth import _extract_status_id_from_payload, _is_edit_allowed_for_status, _redeem_ticket_payload


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

    validation_state = get_validation_state(int(fk))
    validation_state["meta_id"] = int(fk)
    validation_state["tekuis_saved"] = _has_active_tekuis(int(fk))

    payload = _redeem_ticket_payload(ticket, request=request) or {}
    status_id = _extract_status_id_from_payload(payload)
    initial_allow_edit = _is_edit_allowed_for_status(status_id)

    return render(
        request,
        "index.html",
        {
            "ticket": ticket,
            "meta_id": fk,
            "validation_state": validation_state,
            "initial_status_id": status_id,
            "initial_allow_edit": initial_allow_edit,
        },
    )
