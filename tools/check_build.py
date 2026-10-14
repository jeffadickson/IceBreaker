#!/usr/bin/env python3
"""Validate IceBreaker's build manifests and committed lockfile coverage."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tomllib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return {}


def read_toml(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return {}


def main() -> int:
    package = read_json(ROOT / "package.json")
    lock = read_json(ROOT / "package-lock.json")
    check(lock.get("lockfileVersion") == 3, "npm lockfile must use format v3")
    check(lock.get("packages", {}).get("", {}).get("optionalDependencies") ==
          package.get("optionalDependencies"),
          "npm optional dependency versions do not match package-lock.json")
    check((ROOT / ".nvmrc").is_file(), "Missing Node version pin .nvmrc")
    sdk = read_json(ROOT / "global.json")
    check(sdk.get("sdk", {}).get("version", "").startswith("8.0."),
          "global.json must select supported .NET 8 SDK")

    props = ROOT / "Directory.Packages.props"
    try:
        tree = ET.parse(props)
        check(tree.findtext(".//ManagePackageVersionsCentrally") == "true",
              "NuGet central package management must be enabled")
        versions = {item.attrib["Include"]: item.attrib["Version"]
                    for item in tree.findall(".//PackageVersion")}
    except (ET.ParseError, OSError, KeyError) as exc:
        errors.append(f"Directory.Packages.props: {exc}")
        versions = {}

    projects = sorted((ROOT / "apps" / "rink-local").rglob("*.csproj"))
    check(len(projects) >= 4, "Expected at least four .NET projects")
    for project in projects:
        if any(x in project.parts for x in ("bin", "obj")):
            continue
        try:
            doc = ET.parse(project)
            for dep in doc.findall(".//PackageReference"):
                name = dep.attrib.get("Include", "")
                check("Version" not in dep.attrib and dep.find("Version") is None,
                      f"{project.relative_to(ROOT)} has an inline NuGet version: {name}")
                check(name in versions, f"Missing central NuGet version: {name}")
        except (ET.ParseError, OSError) as exc:
            errors.append(f"{project.relative_to(ROOT)}: {exc}")
        lock_path = project.parent / "packages.lock.json"
        resolved = read_json(lock_path)
        check(resolved.get("version") == 2 and bool(resolved.get("dependencies")),
              f"Missing/invalid NuGet lock for {project.relative_to(ROOT)}")

    desktop = ROOT / "apps" / "rink-local" / "src" / "Icebreaker.Timekeeper.Desktop"
    win_lock = read_json(desktop / "packages.win-x64.lock.json")
    check(bool(win_lock.get("dependencies")), "Missing win-x64 runtime NuGet lock")

    for directory in (ROOT / "apps" / "frappe" / "icebreaker_league",
                      ROOT / "tools" / "scoreboard-camera"):
        pyproject = read_toml(directory / "pyproject.toml")
        uvlock = read_toml(directory / "uv.lock")
        check(bool(pyproject.get("project", {}).get("requires-python")),
              f"{directory.relative_to(ROOT)}: missing Python version policy")
        check(uvlock.get("version") == 1 and bool(uvlock.get("package")),
              f"{directory.relative_to(ROOT)}: missing/invalid uv.lock")

    for err in errors:
        print("FAIL", err)
    print(f"Build manifest audit: {len(projects)} .NET projects, "
          f"npm lock, 2 uv locks, {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
