import json
from unittest.mock import patch
from django.test import SimpleTestCase, override_settings
from django.test.client import RequestFactory

from corrections.views.common.auth import _is_edit_allowed_for_status, _redeem_ticket_with_token, require_valid_ticket
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

class EditStatusRuleTests(SimpleTestCase):
    @patch("corrections.views.common.auth.connection.cursor")
    def test_is_edit_allowed_for_status_reads_status_control(self, mock_cursor):
        class _Cursor:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchone(self):
                return (True,)

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        mock_cursor.return_value = _Cursor()
        self.assertTrue(_is_edit_allowed_for_status(15))

    @patch("corrections.views.common.auth.connection.cursor")
    def test_is_edit_allowed_for_status_returns_false_when_missing(self, mock_cursor):
        class _Cursor:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchone(self):
                return None

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        mock_cursor.return_value = _Cursor()
        self.assertFalse(_is_edit_allowed_for_status(0))


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

    @patch("corrections.views.features.info._is_edit_allowed_for_status", return_value=True)
    @patch("corrections.views.features.info._has_active_tekuis", return_value=True)
    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_uses_status_control_for_edit_permission(self, mock_payload, _mock_has_tekuis, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 15)
        self.assertTrue(data["allow_edit"])
        self.assertEqual(data["fk_metadata"], 30)
        self.assertTrue(data["tekuis_action_locked"])

    @patch("corrections.views.features.info._is_edit_allowed_for_status", return_value=False)
    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_hides_edit_for_disabled_status(self, mock_payload, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["allow_edit"])

    @patch("corrections.views.features.info.connection.cursor")
    @patch("corrections.views.features.info._is_edit_allowed_for_status", return_value=True)
    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_locks_draw_and_snap_when_active_gis_data_exists(self, mock_payload, _mock_allow, mock_cursor):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}

        class _Cursor:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchone(self):
                return (1,)

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        mock_cursor.return_value = _Cursor()

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data["draw_snap_locked"])

    @patch("corrections.views.features.info.connection.cursor")
    @patch("corrections.views.features.info._is_edit_allowed_for_status", return_value=True)
    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_keeps_draw_and_snap_enabled_when_no_active_gis_data(self, mock_payload, _mock_allow, mock_cursor):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}

        class _Cursor:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchone(self):
                return None

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        mock_cursor.return_value = _Cursor()

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertFalse(data["draw_snap_locked"])

    @patch("corrections.views.features.info._has_active_tekuis")
    @patch("corrections.views.features.info.connection.cursor")
    @patch("corrections.views.features.info._is_edit_allowed_for_status", return_value=True)
    @patch("corrections.views.features.info._redeem_ticket_payload")
    def test_ticket_status_skips_lock_checks_when_include_locks_disabled(self, mock_payload, _mock_allow, mock_cursor, mock_has_tekuis):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}

        response = ticket_status(self.factory.get("/api/ticket-status/", {"ticket": "abc", "include_locks": "0"}))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertFalse(data["draw_snap_locked"])
        self.assertFalse(data["tekuis_action_locked"])
        mock_cursor.assert_not_called()
        mock_has_tekuis.assert_not_called()


class Status15ApiGuardTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("corrections.views.common.auth._is_edit_allowed_for_status", return_value=False)
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    def test_soft_delete_blocks_when_status_has_no_edit_permission(self, mock_payload, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = soft_delete_gis_by_ticket(self.factory.post("/api/layers/soft-delete-by-ticket/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])

    @patch("corrections.views.common.auth._is_edit_allowed_for_status", return_value=True)
    @patch("corrections.views.features.gis._redeem_ticket")
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.features.gis.transaction.atomic")
    def test_soft_delete_allows_edit_enabled_status_to_continue(self, mock_atomic, mock_payload, mock_redeem, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 15}}
        mock_redeem.return_value = 30

        class _FakeCursor:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchone(self):
                return None

            def fetchall(self):
                return []

        fake_cursor = _FakeCursor()

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

    @patch("corrections.views.common.auth._is_edit_allowed_for_status", return_value=False)
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_upload_shp_blocks_edit_disabled_statuses(self, _mock_ticket, mock_payload, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = upload_shp(self.factory.post("/api/upload-shp/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])
        
    @patch("corrections.views.common.auth._is_edit_allowed_for_status", return_value=False)
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_upload_points_blocks_edit_disabled_statuses(self, _mock_ticket, mock_payload, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = upload_points(self.factory.post("/api/upload-points/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])

    @patch("corrections.views.common.auth._is_edit_allowed_for_status", return_value=False)
    @patch("corrections.views.common.auth._redeem_ticket_payload")
    @patch("corrections.views.common.auth._redeem_ticket_with_token", return_value=(30, "jwt"))
    def test_attributes_options_blocks_edit_disabled_statuses(self, _mock_ticket, mock_payload, _mock_allow):
        mock_payload.return_value = {"id": "30", "status": {"value": 0}}

        response = attributes_options(self.factory.get("/api/attributes/options/", {"ticket": "abc"}))

        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data["status_id"], 0)
        self.assertFalse(data["ok"])