# Deployment and GitHub state

This is a **locally prepared repository**, not evidence of a remote GitHub push or production deployment.

## Implemented

- Runnable local Node.js 22.13+ API server with SQLite authority.
- Browser scorekeeper, parent live tracker, and league schedule/stats website.
- League database persistence and certified-results API prototype.
- C# event/mercy/announcer modules and .NET spectator gateway scaffold.
- Requirements, source audit, HTML manuals, CI tests.

## Not yet production ready

- Authorized remote rink uploads, cryptographic station identity, central event ingestion.
- A complete referee signing/certification workflow driven by Elsa.
- Parent account authentication, favorite-player privacy permissions, outgoing email.
- Unified .NET production game authority, end-to-end browser tests, security review.

## GitHub upload

The intended owner/repo is `jeffadickson/IceBreaker` but actual remote existence/access must be checked before pushing. Use an authenticated Git installation; never force-push without inspecting history.

```powershell
git remote add origin https://github.com/jeffadickson/IceBreaker.git
git fetch origin
git status
git push -u origin main
```

If the remote already has commits, fetch, compare, and integrate before any push.
