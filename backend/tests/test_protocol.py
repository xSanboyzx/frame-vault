import io
import json
import os
import subprocess
import sys

import numpy as np
import pytest

from frame_vault_engine.worker import handle, serve


def request(command: str, version: int = 1) -> str:
    return json.dumps({"protocolVersion": version, "id": "test-1", "command": command})


def test_health_exercises_dependencies() -> None:
    response, stop = handle(request("health"))
    assert response.id == "test-1"
    assert response.error is None
    assert response.result is not None
    assert set(response.result["dependencies"]) == {"numpy", "pandas", "sqlite"}  # type: ignore[arg-type]
    assert not stop


def test_dependency_failure_preserves_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args: object, **kwargs: object) -> None:
        raise RuntimeError("Dependency failed")

    monkeypatch.setattr(np, "mean", fail)
    response, stop = handle(request("health"))
    assert response.id == "test-1"
    assert response.error is not None
    assert response.error.code == "INTERNAL_ERROR"
    assert not stop


@pytest.mark.parametrize(
    "line", ["{", "[]", "{}", '{"protocolVersion":true,"id":"x","command":"health"}']
)
def test_malformed_requests(line: str) -> None:
    response, stop = handle(line)
    assert response.error is not None
    assert response.error.code == "INVALID_REQUEST"
    assert not stop


@pytest.mark.parametrize(
    ("command", "version", "code"),
    [("capture", 1, "UNKNOWN_COMMAND"), ("health", 2, "PROTOCOL_MISMATCH")],
)
def test_unsupported_requests(command: str, version: int, code: str) -> None:
    response, stop = handle(request(command, version))
    assert response.error is not None
    assert response.error.code == code
    assert response.id == "test-1"
    assert not stop


def test_bad_message_does_not_poison_stream_and_shutdown_stops_it() -> None:
    output = io.StringIO()
    serve(
        io.StringIO(
            "{\n" + request("health") + "\n" + request("shutdown") + "\n" + request("health")
        ),
        output,
    )
    responses = [json.loads(line) for line in output.getvalue().splitlines()]
    assert len(responses) == 3
    assert responses[1]["result"]["protocolVersion"] == 1
    assert responses[2]["result"] == {"stopped": True}


def test_worker_process_exits_on_shutdown_and_eof() -> None:
    for data in [request("health") + "\n" + request("shutdown") + "\n", ""]:
        result = subprocess.run(
            [sys.executable, "-m", "frame_vault_engine"],
            input=data,
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        assert "Traceback" not in result.stderr
        if data:
            assert len(result.stdout.splitlines()) == 2
