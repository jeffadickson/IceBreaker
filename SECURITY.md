# Security policy

**Do not deploy the existing local rink server to the public Internet.** It uses a development shared operator key and lacks production identity, authorization, rate limiting, and device trust.

Report vulnerabilities privately to the repository maintainers using GitHub security advisories once enabled. Avoid posting youth information, credentials, or exploitable live game details in public issues. See `docs/site/security.html`.

## STRIDE threat register

See [IceBreaker STRIDE threat model](requirements/stride-threat-model.md) for system trust boundaries, 16 tracked spoofing/tampering/repudiation/information-disclosure/denial-of-service/elevation-of-privilege risks, implementation evidence and production release blockers. This is a living risk register, not a completed audit or security certification.

The development server now has a bounded **in-memory** login throttle for referee, registrar and family login. This does **not** replace a distributed production rate limiter or strong per-device operator identity. The current shared operator key and client-supplied operator ID are a critical open risk. Do not use real minors' information until the production privacy/security gates have passed.
