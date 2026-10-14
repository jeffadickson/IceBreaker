#!/usr/bin/env python3
"""Cross-platform IceBreaker developer entry point; Python stdlib only.

This orchestrates *native* build tools. It does not replace MSBuild, Node's
test runner, uv, or Frappe Bench, and never starts production services.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
RINK = ROOT / "apps" / "rink-local"
FRAPPE = ROOT / "apps" / "frappe" / "icebreaker_league"
CAMERA = ROOT / "tools" / "scoreboard-camera"
DOTNET_TEST = RINK / "tests" / "Icebreaker.Core.Tests" / "Icebreaker.Core.Tests.csproj"
DOTNET_DESKTOP = RINK / "src" / "Icebreaker.Timekeeper.Desktop" / "Icebreaker.Timekeeper.Desktop.csproj"
DOTNET_GATEWAY = RINK / "src" / "Icebreaker.SpectatorGateway" / "Icebreaker.SpectatorGateway.csproj"


def run(*args: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> None:
    print("+ " + " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, env=env, check=True)


def version(executable: str, flag: str = "--version") -> str | None:
    if not shutil.which(executable):
        return None
    try:
        return subprocess.check_output([executable, flag], text=True, stderr=subprocess.STDOUT, timeout=12).strip()
    except (OSError, subprocess.SubprocessError):
        return None


def check_version(name: str, minimum: tuple[int, ...], *, required: bool = True) -> bool:
    raw = version(name)
    match = re.search(r"\b(\d+)\.(\d+)(?:\.(\d+))?", raw or "")
    actual = tuple(int(part or 0) for part in match.groups()) if match else None
    good = actual is not None and actual >= minimum
    state = "OK" if good else ("MISSING/OLD" if required else "OPTIONAL")
    print(f"  {state:11} {name:8} {raw or 'not installed'} (need {'.'.join(map(str, minimum))}+)")
    return good or not required


def doctor(profile: str) -> bool:
    print(f"IceBreaker environment — {profile}")
    good = check_version("node", (22, 13))
    good = check_version("dotnet", (8, 0, 400)) and good
    good = check_version("python", (3, 12)) and good
    good = check_version("git", (2, 0)) and good
    if profile in ("frappe", "all"):
        good = check_version("uv", (0, 5)) and good
        print("  INFO        Frappe v16 Bench additionally requires Python 3.14+, Node 24+, MariaDB and Redis.")
        print("  INFO        This doctor does not claim a live Frappe Bench is installed or configured.")
    if profile in ("camera", "all"):
        good = check_version("uv", (0, 5)) and good
        print("  INFO        Camera/OpenCV is optional and never controls the official scoreboard.")
    return good


def node_tests() -> None:
    files = sorted((RINK / "tests" / "browser").glob("*.test.js"))
    files += sorted((ROOT / "tests" / "integration").glob("*.test.js"))
    files += sorted((ROOT / "tests" / "architecture").glob("*.test.js"))
    if not files:
        raise RuntimeError("No Node tests found")
    run("node", "--test", *(str(p.relative_to(ROOT)) for p in files))


def frappe_tests() -> None:
    if not shutil.which("uv"):
        raise RuntimeError("uv is required for locked Frappe contract tests")
    env = dict(os.environ, PYTHONPATH=str(FRAPPE))
    run("uv", "run", "--project", str(FRAPPE), "--locked", "--no-dev",
        "python", "-m", "unittest", "discover", "-s", str(FRAPPE / "tests"),
        "-p", "test_*.py", env=env)


def camera_tests() -> None:
    if not shutil.which("uv"):
        raise RuntimeError("uv is required for locked camera tests")
    run("uv", "run", "--project", str(CAMERA), "--locked",
        "python", "-m", "unittest", "discover", "-s", str(CAMERA),
        "-p", "test_*.py")


def dotnet_test(configuration: str) -> None:
    run("dotnet", "test", str(DOTNET_TEST), "-c", configuration, "--nologo")


def build(configuration: str) -> None:
    run("dotnet", "build", str(DOTNET_DESKTOP), "-c", configuration, "--nologo")
    run("dotnet", "build", str(DOTNET_GATEWAY), "-c", configuration, "--nologo")
    run("python", "-m", "compileall", "-q", str(FRAPPE / "icebreaker_league"))


def bootstrap(profile: str) -> None:
    if not doctor("frappe" if profile == "core" else profile):
        raise RuntimeError("Install the required SDKs and retry")
    for required in (
        ROOT / "package-lock.json",
        FRAPPE / "uv.lock",
        DOTNET_TEST.parent / "packages.lock.json",
        DOTNET_DESKTOP.parent / "packages.lock.json",
    ):
        if not required.exists():
            raise RuntimeError(f"Missing committed lockfile: {required.relative_to(ROOT)}")
    run("npm", "ci", "--ignore-scripts", "--no-audit")
    run("dotnet", "restore", str(DOTNET_TEST), "--locked-mode", "--nologo")
    run("dotnet", "restore", str(DOTNET_GATEWAY), "--locked-mode", "--nologo")
    run("uv", "sync", "--project", str(FRAPPE), "--locked", "--no-dev")
    if profile in ("camera", "all"):
        run("uv", "sync", "--project", str(CAMERA), "--locked")


def publish(configuration: str, runtime: str, output: str) -> None:
    if runtime != "win-x64":
        raise ValueError("Only win-x64 is currently release-locked")
    destination = Path(output).resolve()
    if ROOT not in destination.parents:
        raise ValueError("Publish output must be within the repository working tree")
    run("dotnet", "publish", str(DOTNET_DESKTOP), "-c", configuration,
        "-r", runtime, "--self-contained", "false", "-o", str(destination),
        "-p:RestoreLockedMode=true", "-p:NuGetLockFilePath=packages.win-x64.lock.json",
        "--nologo")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["doctor", "bootstrap", "test", "build", "check", "publish", "frappe-test", "camera-test"])
    parser.add_argument("--profile", choices=["core", "frappe", "camera", "all"], default="core")
    parser.add_argument("--configuration", choices=["Debug", "Release"], default="Debug")
    parser.add_argument("--runtime", choices=["win-x64"], default="win-x64")
    parser.add_argument("--output", default="out/desktop")
    args = parser.parse_args(argv)
    if args.command == "doctor":
        return 0 if doctor(args.profile) else 1
    try:
        if args.command == "bootstrap":
            bootstrap(args.profile)
        if args.command in ("test", "check"):
            run("python", str(ROOT / "tools" / "check_docs.py"))
            node_tests()
            dotnet_test(args.configuration)
            frappe_tests()
        if args.command in ("build", "check"):
            build(args.configuration)
        if args.command == "frappe-test":
            frappe_tests()
        if args.command == "camera-test":
            camera_tests()
        if args.command == "publish":
            publish(args.configuration, args.runtime, args.output)
    except (subprocess.CalledProcessError, RuntimeError, ValueError) as exc:
        print(f"IceBreaker {args.command} failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
