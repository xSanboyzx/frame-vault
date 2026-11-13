"""Versioned JSON-lines protocol. Only protocol responses are written to stdout."""

import json
import logging
import platform
import sqlite3
from typing import TextIO

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from frame_vault_engine import PROTOCOL_VERSION, __version__

logger = logging.getLogger(__name__)


class Request(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    protocol_version: int = Field(alias="protocolVersion")
    id: str = Field(min_length=1, max_length=128)
    command: str


class EngineError(BaseModel):
    code: str
    message: str


class Response(BaseModel):
    protocol_version: int = Field(default=PROTOCOL_VERSION, alias="protocolVersion")
    id: str | None
    result: dict[str, object] | None = None
    error: EngineError | None = None


def failure(request_id: str | None, code: str, message: str) -> Response:
    return Response(id=request_id, error=EngineError(code=code, message=message))


def handle(line: str) -> tuple[Response, bool]:
    request_id = None
    try:
        raw = json.loads(line)
        if isinstance(raw, dict) and isinstance(raw.get("id"), str):
            request_id = raw["id"]
        request = Request.model_validate(raw)
    except ValueError:
        return failure(request_id, "INVALID_REQUEST", "Expected a valid protocol request."), False

    if request.protocol_version != PROTOCOL_VERSION:
        return failure(request.id, "PROTOCOL_MISMATCH", "Expected protocol version 1."), False
    try:
        return execute(request)
    except Exception:
        logger.exception("Engine command failed")
        return failure(request.id, "INTERNAL_ERROR", "The engine command failed."), False


def execute(request: Request) -> tuple[Response, bool]:
    if request.command == "health":
        # Exercise the libraries as well as importing them before reporting readiness.
        if float(np.mean(pd.Series([1.0, 3.0]).to_numpy())) != 2.0:
            raise RuntimeError("The numerical dependency self-check failed.")
        with sqlite3.connect(":memory:") as database:
            database.execute("SELECT 1").fetchone()
        return Response(
            id=request.id,
            result={
                "engineVersion": __version__,
                "protocolVersion": PROTOCOL_VERSION,
                "pythonVersion": platform.python_version(),
                "dependencies": {
                    "numpy": np.__version__,
                    "pandas": pd.__version__,
                    "sqlite": sqlite3.sqlite_version,
                },
            },
        ), False
    if request.command == "shutdown":
        return Response(id=request.id, result={"stopped": True}), True
    return failure(request.id, "UNKNOWN_COMMAND", "The requested command is not supported."), False


def serve(source: TextIO, destination: TextIO) -> None:
    logging.basicConfig(level=logging.INFO)
    for line in source:
        response, stop = handle(line)
        destination.write(response.model_dump_json(by_alias=True, exclude_none=True) + "\n")
        destination.flush()
        if stop:
            return
