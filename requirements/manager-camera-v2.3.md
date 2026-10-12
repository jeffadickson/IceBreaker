# IceBreaker v2.3 proposed requirements — managerial workflow & camera input

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| CAM-001 | P1 | A fixed-camera observer shall extract configured seven-segment scoreboard fields with timestamps and confidence. | Synthetic digits, unreadable/out-of-bounds tests |
| CAM-002 | P0 | Camera observations shall never mutate authoritative scores, penalty, or clock events. | Observer API contains no write command; security review |
| CAM-003 | P1 | Unreadable/ambiguous digits shall be reported as unknown, not coerced to zero. | Low-confidence and blank-frame tests |
| CAM-004 | P1 | Camera values shall be compared with official state and discrepancies raised for review. | Comparison test |
| CAM-005 | P1 | Camera calibration shall be stored in a versioned, hardware-specific configuration file. | Config review |
| MGR-020 | P0 | League-specific per-game administrative task lists shall be loaded from versioned files, not embedded in scorer logic. | Three game-type profiles tested |
| MGR-021 | P0 | A team manager shall track tasks, evidence references, completion actor, and timestamp in an append-only audit record. | Reopen/record tests |
| MGR-022 | P0 | Game-specific workflows shall retain their assigned policy version when the league changes templates. | Version mismatch test |
| MGR-023 | P1 | Teams shall be able to track external referee requests, third-party portal submissions, and evidence without claiming automated external updates. | Evidence workflow test |
| MGR-024 | P1 | Game check-in shall track coach signatures, inactive players/coaches, and separately signed scoresheet copies when required by league policy. | League workflow profile validation |
| MGR-025 | P1 | Official blank exhibition scoresheet links and league rules shall be kept as configurable references, with periodic policy review. | Link and policy verification |

**Limitations:** This implementation introduces a file-driven workflow library and camera-observation tool. It does **not** yet add persistent manager checklist tables, authentication endpoints, device enrollment, integrated camera UI, automated SCAHA portal uploads, or licensed scoresheet templates. These remain integration tasks.