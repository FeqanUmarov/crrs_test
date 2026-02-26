from unittest.mock import patch
from django.test import SimpleTestCase, override_settings

from corrections.views.auth import _redeem_ticket_with_token


class DummyResponse:
    def __init__(self, status_code=200, data=None, text=""):
        self.status_code = status_code
        self._data = data or {}
        self.text = text
        self.content = text.encode("utf-8") if text else b""

    def json(self):
        return self._data


class RedeemWithTokenTests(SimpleTestCase):
    @override_settings(
        NODE_REDEEM_URL="http://node/redeem",
        NODE_REDEEM_METHOD="FORM",
        NODE_REDEEM_AUTH_HEADER="Bearer custom-token",
    )
    @patch("corrections.views.auth.requests.post")
    def test_uses_custom_auth_header_and_parses_success(self, mock_post):
        mock_post.return_value = DummyResponse(
            status_code=200,
            data={"valid": True, "id": 20, "token": "jwt", "exp": 9999999999999},
        )

        fk, tok = _redeem_ticket_with_token("abc")

        self.assertEqual((fk, tok), (20, "jwt"))
        called_headers = mock_post.call_args.kwargs["headers"]
        self.assertEqual(called_headers["Authorization"], "Bearer custom-token")

    @override_settings(
        NODE_REDEEM_URL="http://node/redeem",
        NODE_REDEEM_METHOD="FORM",
        NODE_REDEEM_AUTH_HEADER="",
        NODE_REDEEM_BEARER="fallback-secret",
    )
    @patch("corrections.views.auth.requests.post")
    def test_falls_back_to_node_redeem_bearer_setting(self, mock_post):
        mock_post.return_value = DummyResponse(
            status_code=200,
            data={"valid": True, "id": 7, "token": "jwt", "exp": 9999999999999},
        )

        fk, tok = _redeem_ticket_with_token("abc")

        self.assertEqual((fk, tok), (7, "jwt"))
        called_headers = mock_post.call_args.kwargs["headers"]
        self.assertEqual(called_headers["Authorization"], "Bearer fallback-secret")

    @override_settings(
        NODE_REDEEM_URL="http://node/redeem",
        NODE_REDEEM_METHOD="FORM",
        NODE_REDEEM_AUTH_HEADER="",
        NODE_REDEEM_BEARER="",
    )
    @patch("corrections.views.auth.requests.get")
    @patch("corrections.views.auth.requests.post")
    def test_returns_none_when_every_attempt_is_unauthorized(self, mock_post, mock_get):
        mock_post.return_value = DummyResponse(status_code=401, text="unauthorized")
        mock_get.return_value = DummyResponse(status_code=401, text="unauthorized")

        fk, tok = _redeem_ticket_with_token("abc")

        self.assertEqual((fk, tok), (None, None))

    @override_settings(
        NODE_REDEEM_URL="http://node/redeem",
        NODE_REDEEM_METHOD="FORM",
        NODE_REDEEM_AUTH_HEADER="",
        NODE_REDEEM_BEARER="",
    )
    @patch("corrections.views.auth.requests.post")
    def test_prefers_incoming_authorization_header_from_request(self, mock_post):
        mock_post.return_value = DummyResponse(
            status_code=200,
            data={"valid": True, "id": 11, "token": "jwt", "exp": 9999999999999},
        )

        class Req:
            headers = {"Authorization": "Bearer live-user-token"}
            META = {"HTTP_AUTHORIZATION": "Bearer live-user-token"}

        fk, tok = _redeem_ticket_with_token("abc", request=Req())

        self.assertEqual((fk, tok), (11, "jwt"))
        called_headers = mock_post.call_args.kwargs["headers"]
        self.assertEqual(called_headers["Authorization"], "Bearer live-user-token")