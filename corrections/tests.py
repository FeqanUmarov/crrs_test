from unittest.mock import patch
from django.test import SimpleTestCase, override_settings

from corrections.views.auth import _redeem_ticket_with_token
from corrections.views.mssql import _is_edit_allowed_for_fk


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

class _FakeCursor:
    def __init__(self, columns, status_row):
        self.columns = columns
        self.status_row = status_row
        self._last_sql = ''

    def execute(self, sql, params=None):
        self._last_sql = sql

    def fetchall(self):
        if 'INFORMATION_SCHEMA.COLUMNS' in self._last_sql:
            return [(c,) for c in self.columns]
        return []

    def fetchone(self):
        if 'SELECT TOP 1 STATUS_ID' in self._last_sql:
            return self.status_row
        return None


class _FakeConn:
    def __init__(self, columns, status_row):
        self._cursor = _FakeCursor(columns, status_row)

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class EditStatusRuleTests(SimpleTestCase):
    @override_settings(MSSQL_STATUS_SCHEMA='original')
    @patch('corrections.views.mssql._mssql_connect')
    def test_allows_only_status_15_and_99_from_original_schema(self, mock_connect):
        mock_connect.return_value = _FakeConn(columns=['ROW_ID', 'STATUS_ID'], status_row=(15,))
        allowed, sid = _is_edit_allowed_for_fk(77)
        self.assertEqual((allowed, sid), (True, 15))

        mock_connect.return_value = _FakeConn(columns=['ROW_ID', 'STATUS_ID'], status_row=(99,))
        allowed, sid = _is_edit_allowed_for_fk(77)
        self.assertEqual((allowed, sid), (True, 99))

        mock_connect.return_value = _FakeConn(columns=['ROW_ID', 'STATUS_ID'], status_row=(2,))
        allowed, sid = _is_edit_allowed_for_fk(77)
        self.assertEqual((allowed, sid), (False, 2))

    @patch('corrections.views.mssql._mssql_connect', side_effect=RuntimeError('db down'))
    @patch('corrections.views.mssql._mssql_fetch_request', return_value={'STATUS_ID': 15})
    def test_falls_back_to_fetch_request_when_direct_query_fails(self, mock_fetch, mock_connect):
        allowed, sid = _is_edit_allowed_for_fk(88)

        self.assertEqual((allowed, sid), (True, 15))
        mock_fetch.assert_called_once_with(88)