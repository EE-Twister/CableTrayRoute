// Siemens SPEEDFAX 2024: 3VA51 and 3VA52 TM230 fixed-Ir settings.
export const SMALL_MOTOR_BREAKER_PICKUPS = Object.freeze([150, 180, 210, 240, 270, 300]);
export const MOTOR_35A_BREAKER_PICKUPS = Object.freeze([175, 210, 245, 280, 315, 350]);
export const MOTOR_60A_BREAKER_PICKUPS = Object.freeze([300, 360, 420, 480, 540, 600]);
export const MOTOR_50A_BREAKER_PICKUPS = Object.freeze([250, 300, 350, 400, 450, 500]);
export const MOTOR_70A_BREAKER_PICKUPS = Object.freeze([350, 420, 490, 560, 630, 700]);
export const MOTOR_90A_3VA52_BREAKER_PICKUPS = Object.freeze([450, 540, 630, 720, 810, 900]);
export const SUPPORTED_MOTOR_BREAKER_PICKUPS = Object.freeze([...new Set([...SMALL_MOTOR_BREAKER_PICKUPS, ...MOTOR_35A_BREAKER_PICKUPS, ...MOTOR_50A_BREAKER_PICKUPS, ...MOTOR_60A_BREAKER_PICKUPS, ...MOTOR_70A_BREAKER_PICKUPS, ...MOTOR_90A_3VA52_BREAKER_PICKUPS])].sort((a, b) => a - b));

/** Explicit null suppresses an inherited project value; omission inherits it. */
export function resolveMotorStarterPickup(motor, criteria) {
  if (motor && Object.prototype.hasOwnProperty.call(motor, 'instantaneousPickupA')) {
    return { value: motor.instantaneousPickupA === null ? undefined : motor.instantaneousPickupA, basis: motor.instantaneousPickupA === null ? 'motor-unset' : 'motor' };
  }
  const value = criteria?.motorStarter?.instantaneousPickupA;
  return { value, basis: value === undefined ? 'unspecified' : 'project' };
}
