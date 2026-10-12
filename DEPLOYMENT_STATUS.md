# Deployment and GitHub state

**Source publication:** The complete 158-file v1.5 expanded repository was pushed to `jeffadickson/IceBreaker` on 2026-10-12 and its remote Git tree was verified (158 blobs). This is **not** a production deployment or security certification.

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

The GitHub repository is [jeffadickson/IceBreaker](https://github.com/jeffadickson/IceBreaker). The initial complete source publication is finished. For future updates, use an authenticated Git installation and never force-push without inspecting history.

```powershell
git remote add origin https://github.com/jeffadickson/IceBreaker.git
git fetch origin
git status
git push -u origin main
```

If the remote already has commits, fetch, compare, and integrate before any push.
