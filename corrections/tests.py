import json
from unittest.mock import patch
from django.test import SimpleTestCase, override_settings
from django.test.client import RequestFactory

from corrections.views.common.auth import _redeem_ticket_with_token, require_valid_ticket
from corrections.views.common.mssql import _is_edit_allowed_for_fk
from corrections.views.features.gis import soft_delete_gis_by_ticket
from corrections.views.features.uploads import upload_points, upload_shp
from corrections.views.features.info import attributes_options, ticket_status


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
    @patch("corrections.views.common.auth.requests.post")
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
    @patch("corrections.views.common.auth.requests.post")
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
    @patch("corrections.views.common.auth.requests.get")
    @patch("corrections.views.common.auth.requests.post")
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
    @patch("corrections.views.common.auth.requests.post")
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
    @patch('corrections.views.common.mssql._mssql_connect')
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

    @patch('corrections.views.common.mssql._mssql_connect', side_effect=RuntimeError('db down'))
    @patch('corrections.views.common.mssql._mssql_fetch_request', return_value={'STATUS_ID': 15})
    def test_falls_back_to_fetch_request_when_direct_query_fails(self, mock_fetch, mock_connect):
        allowed, sid = _is_edit_allowed_for_fk(88)

        self.assertEqual((allowed, sid), (True, 15))
        mock_fetch.assert_called_once_with(88)


class JwtIdentityHardeningTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(ALLOW_UNVERIFIED_JWT_IDENTITY=False)
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(12, "a.b.c"))
    def test_require_valid_ticket_does_not_trust_unverified_claims_by_default(self, _mock_redeem):
        @require_valid_ticket
        def _view(request):
            return {
                "uid": getattr(request, "user_id_from_token", None),
                "full_name": getattr(request, "user_full_name_from_token", None),
                "fk": getattr(request, "fk_metadata", None),
            }

        request = self.factory.get("/dummy", {"ticket": "abc"})
        data = _view(request)

        self.assertEqual(data["fk"], 12)
        self.assertIsNone(data["uid"])
        self.assertIsNone(data["full_name"])

    @override_settings(ALLOW_UNVERIFIED_JWT_IDENTITY=True)
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(12, "a.b.c"))
    @patch("corrections.views.common.auth._parse_jwt_user", return_value=(55, "Test User"))
    def test_require_valid_ticket_keeps_legacy_mode_behind_flag(self, _mock_parse, _mock_redeem):
        @require_valid_ticket
        def _view(request):
            return (
                getattr(request, "user_id_from_token", None),
                getattr(request, "user_full_name_from_token", None),
            )

        request = self.factory.get("/dummy", {"ticket": "abc"})
        uid, full_name = _view(request)

        self.assertEqual(uid, 55)
        self.assertEqual(full_name, "Test User")

class TicketStatusViewTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_uses_redeem_status_value_for_edit_permission(self, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 15)
        self.assertTrue(data["allow_edit"])
        self.assertEqual(data["fk_metadata"], 30)

    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_hides_edit_for_non_15_statuses(self, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["allow_edit"])


class Status15ApiGuardTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("corrections.views.common.auth._redeem_ticket_payload")
    def test_soft_delete_blocks_non_15_statuses(self, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = soft_delete_gis_by_ticket(self.factory.post("/api/layers/soft-delete-by-ticket/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])

    @patch("corrections.views.features.gis._redeem_ticket")
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.features.gis.transaction.atomic")
    def test_soft_delete_allows_status_15_to_continue(self, mock_atomic, mock_payload, mock_redeem):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}
        mock_redeem.return_value = 30

        fake_cursor = _FakeCursor(columns=[], status_row=None)

        class _CursorCtx:
            def __enter__(self_inner):
                return fake_cursor

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        class _AtomicCtx:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        mock_atomic.return_value = _AtomicCtx()

        with patch("corrections.views.features.gis.connection.cursor", return_value=_CursorCtx()), \
             patch("corrections.views.features.gis._soft_delete_tekuis_current", return_value=[]), \
             patch("corrections.views.features.gis._soft_delete_table_by_meta_id", return_value=0), \
             patch("corrections.views.features.gis._mssql_clear_objectid", return_value=True):
            response = soft_delete_gis_by_ticket(
                self.factory.post("/api/layers/soft-delete-by-ticket/", {"ticket": "abc"})
            )

        self.assertNotEqual(response.status_code, 403)

class Status15RestrictedApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_upload_shp_blocks_non_15_statuses(self, _mock_ticket, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = upload_shp(self.factory.post("/api/upload-shp/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])

    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_upload_points_blocks_non_15_statuses(self, _mock_ticket, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = upload_points(self.factory.post("/api/upload-points/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])

    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_attributes_options_blocks_non_15_statuses(self, _mock_ticket, mock_payload):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = attributes_options(self.factory.get("/api/attributes/options/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])