import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import DEFAULT_CORS_ORIGINS, app, get_cors_origins


class TestBackendIntegration(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_endpoint_shape(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("api_key_set", body)
        self.assertIn("dataset_exists", body)
        self.assertIn("glossary_exists", body)
        self.assertIsInstance(body["api_key_set"], bool)
        self.assertIsInstance(body["dataset_exists"], bool)
        self.assertIsInstance(body["glossary_exists"], bool)

    def test_cors_allows_localhost_3000(self) -> None:
        response = self.client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:3000")
        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")

    def test_cors_blocks_unlisted_origin(self) -> None:
        response = self.client.options(
            "/api/health",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIsNone(response.headers.get("access-control-allow-origin"))

    def test_get_cors_origins_uses_default_when_unset(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(get_cors_origins(), DEFAULT_CORS_ORIGINS)

    def test_get_cors_origins_parses_env_list(self) -> None:
        with patch.dict(
            "os.environ",
            {"CORS_ORIGINS": "http://localhost:3100, http://127.0.0.1:3100"},
            clear=True,
        ):
            self.assertEqual(
                get_cors_origins(),
                ["http://localhost:3100", "http://127.0.0.1:3100"],
            )


if __name__ == "__main__":
    unittest.main()
