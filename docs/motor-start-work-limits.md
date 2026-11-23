# Motor starting study workload limits

Motor starting studies support up to 128 motors, 256 points per torque curve,
4,096 total curve points, 16,384 characters per curve, and 65,536 total curve
characters. These limits apply to string and array curves in both component
fields and `props`, including aliases. Split larger studies into smaller groups.
Oversized curves are rejected before acceleration calculations begin; no curve
is truncated. Points must contain finite `speed:torque` values.

The server API returns HTTP 422 with `MOTOR_START_WORK_LIMIT` for oversized
studies, or `MOTOR_START_CURVE_INVALID` for malformed curves. Browser calculations
use the same limits. Existing defaults for motors without optional parameters
and the 60-second acceleration window remain supported.
