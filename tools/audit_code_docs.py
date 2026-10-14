#!/usr/bin/env python3
"""Report first-party function documentation coverage without modifying source.

Uses Python's AST for Python, and deliberately conservative line heuristics for
JavaScript/TypeScript/C#. Heuristic results are leads for manual review, not a
claim that comments are semantically correct or that every function was found.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".cs"}
EXCLUDED = ("node_modules/", "dist/", "build/", "out/", ".venv/", "vendor/",
            "generated/", "obj/", "bin/", ".git/")
JS_DECL = re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(")
CS_DECL = re.compile(r"^\s*(?:public|internal|protected)\s+(?:(?:static|async|override|virtual|sealed|new|partial)\s+)*[\w<>?,\[\].]+\s+(\w+)\s*\(")


def tracked_files() -> list[Path]:
    """Use Git's index, not filesystem traversal, to avoid untracked secrets."""
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [ROOT / name for name in output.decode().split("\0") if name
            and Path(name).suffix in EXTS and not name.startswith(EXCLUDED)]


def python_findings(path: Path) -> tuple[int, list[dict]]:
    """Find Python function definitions lacking an AST-recognized docstring."""
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    functions = [n for n in ast.walk(tree)
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    missing = [{"line": n.lineno, "name": n.name}
               for n in functions if not ast.get_docstring(n)]
    return len(functions), missing


def source_findings(path: Path) -> tuple[int, list[dict]]:
    """Conservatively find named JS/C# declarations without adjacent doc blocks."""
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    regex = CS_DECL if path.suffix == ".cs" else JS_DECL
    missing = []
    count = 0
    for i, line in enumerate(lines):
        match = regex.match(line)
        if not match:
            continue
        count += 1
        # Look immediately above the declaration, ignoring attributes and
        # empty lines; a remote unrelated comment does not count.
        preceding = []
        j = i - 1
        while j >= 0 and (not lines[j].strip() or lines[j].lstrip().startswith("[") or
                          lines[j].lstrip().startswith(("///", "*", "*/", "/**"))):
            preceding.append(lines[j].strip())
            j -= 1
        if not any(s.startswith("///") for s in preceding) and not any(
                s.startswith("/**") for s in preceding):
            missing.append({"line": i + 1, "name": match.group(1)})
    return count, missing


def main() -> int:
    """Emit a reproducible JSON report; optional threshold applies to findings."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-missing", type=int)
    args = parser.parse_args()
    by_language = Counter()
    findings = []
    failures = []
    for path in tracked_files():
        relative = path.relative_to(ROOT).as_posix()
        try:
            total, missing = (python_findings(path) if path.suffix == ".py"
                              else source_findings(path))
            by_language[path.suffix] += total
            findings.extend({"path": relative, **item} for item in missing)
        except (SyntaxError, UnicodeError, OSError) as exc:
            failures.append({"path": relative, "error": str(exc)})
    result = {"method": "Python AST + conservative JS/TS/C# declaration heuristics",
              "tracked_files": len(tracked_files()),
              "declarations": dict(sorted(by_language.items())),
              "missing_count": len(findings), "findings": findings,
              "parse_failures": failures,
              "limitations": "Not full JS/TS/C# AST; does not judge comment quality or all exports."}
    payload = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(f"Documentation audit: {result['tracked_files']} files, "
          f"{sum(by_language.values())} declarations, {len(findings)} missing, "
          f"{len(failures)} parse failures")
    if args.max_missing is not None and len(findings) > args.max_missing:
        return 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
