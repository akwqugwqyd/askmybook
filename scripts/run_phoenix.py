"""Start the local Phoenix server with project-local durable storage."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


WORKING_DIR = Path("scripts/.phoenix")


def phoenix_command() -> list[str]:
    workspace = Path.cwd()
    executable_names = ["phoenix.exe"] if os.name == "nt" else ["phoenix"]
    search_dirs = [
        Path(sys.executable).parent,
        workspace / ".venv-evals" / "Scripts",
        workspace / ".venv-evals" / "bin",
        workspace / "venv" / "Scripts",
        workspace / "venv" / "bin",
    ]
    checked: list[Path] = []

    for directory in search_dirs:
        for executable_name in executable_names:
            executable = directory / executable_name
            checked.append(executable)
            if executable.exists():
                return [str(executable), "serve"]

    command = shutil.which("phoenix")
    if command:
        return [command, "serve"]

    checked_paths = "\n".join(f"  - {path}" for path in checked)
    raise RuntimeError(
        "Phoenix CLI is unavailable. Run `npm run eval:setup` before starting observability.\n"
        f"Checked:\n{checked_paths}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local Phoenix dashboard and OTLP collector.")
    parser.add_argument("--verbose", action="store_true", help="Show Phoenix server logs.")
    args = parser.parse_args()

    WORKING_DIR.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment["PHOENIX_WORKING_DIR"] = str(WORKING_DIR.resolve())
    # PHOENIX_HOST is also used by the client as a URL; the server needs a bind address.
    environment["PHOENIX_HOST"] = "127.0.0.1"
    environment.setdefault("PHOENIX_PORT", "6006")
    # Keep Phoenix's optional OTLP/gRPC listener separate from common local collectors.
    # This app exports traces over HTTP on port 6006.
    environment.setdefault("PHOENIX_GRPC_PORT", "4318")

    print("Phoenix UI and OTLP collector: http://127.0.0.1:6006")
    print("Keep this process running while the app or evaluation suite executes.")
    try:
        completed = subprocess.run(
            phoenix_command(),
            check=False,
            env=environment,
            stdout=None if args.verbose else subprocess.DEVNULL,
            stderr=None if args.verbose else subprocess.DEVNULL,
        )
        return completed.returncode
    except KeyboardInterrupt:
        print("\nPhoenix stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
