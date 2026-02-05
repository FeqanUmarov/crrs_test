from django.test import TestCase
import json
from unittest.mock import Mock

from django.test import SimpleTestCase

from corrections.tekuis_validation_flow import _collect_issues


class CollectIssuesTests(SimpleTestCase):
    def test_collect_issues_accepts_json_string_payload(self):
        cur = Mock()
        payload = json.dumps({"foo": "bar"})
        cur.fetchall.return_value = [("issue-1", 12.5, payload, "open")]

        issues = _collect_issues(cur, meta_id=1, ticket="T-1")

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["foo"], "bar")
        self.assertEqual(issues[0]["key"], "issue-1")
        self.assertEqual(issues[0]["area_sqm"], 12.5)
        self.assertEqual(issues[0]["status"], "open")

    def test_collect_issues_wraps_non_dict_payload(self):
        cur = Mock()
        cur.fetchall.return_value = [("issue-2", 0, [1, 2, 3], "resolved")]

        issues = _collect_issues(cur, meta_id=1, ticket="T-1")

        self.assertEqual(issues[0]["payload"], [1, 2, 3])
        self.assertEqual(issues[0]["key"], "issue-2")
