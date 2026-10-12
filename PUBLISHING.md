# Publish IceBreaker to GitHub (Windows)

The GitHub destination is **https://github.com/jeffadickson/IceBreaker** (`main`).

## One-command publication

1. Extract the **entire** `IceBreaker_COMPLETE_v1_4_PUBLISH.zip` archive using Windows Extract All. Keep `PUBLISH_TO_GITHUB.ps1` beside this document inside the `IceBreaker` directory.
2. Install Git for Windows and Node.js 22.13+ (if missing).
3. In Windows File Explorer, open the extracted `IceBreaker` folder, type `powershell` in its address bar and press Enter.
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\PUBLISH_TO_GITHUB.ps1
```

The script tests the application, clones the live remote `main` into a new temporary directory, copies all source code, requirements, HTML manuals, examples, binary assets, and tests (excluding `.git`, secrets, runtime SQLite databases, and dependencies), makes one commit, and pushes it. **It does not force-push.** Its output prints the resulting GitHub commit link.

Git credentials may prompt you to sign in through Git Credential Manager. If Git requests an author identity, use:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-verified-github-email@example.com"
```

Then rerun the publisher. A fresh temporary checkout is used on every run; already published changes will be detected as unchanged.

If your team edits `main` during the upload, Git will reject a non-fast-forward push. Rerun the script to clone and reconcile the newer `main` (review any conflicting edits). Never force-push or overwrite collaborators' changes.

## Verification performed before packaging

- Node.js `npm test`: **70 passed, 0 failed** (includes team accounts, parent authentication, event and report tests).
- HTML manuals: **19 pages, 0 broken local links**.
- v1.4 archive comparison: no files missing from the assembled repo.
- `.NET SDK` unavailable in packaging runtime: C# projects were **not** compiled or tested here.
- Google OAuth, live email delivery, referee signing, public internet deployment not production-verified.

See `PACKAGE_AUDIT.md` and `PACKAGE_MANIFEST_SHA256.txt` for files and checksums.
