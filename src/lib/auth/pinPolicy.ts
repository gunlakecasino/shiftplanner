/** Shared PIN quality rules — client + server. */

const WEAK_PINS = new Set([
  "000000",
  "111111",
  "222222",
  "333333",
  "444444",
  "555555",
  "666666",
  "777777",
  "888888",
  "999999",
  "123456",
  "654321",
  "121212",
  "101010",
  "696969",
  "420420",
]);

export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function isWeakPin(pin: string): boolean {
  if (!isValidPinFormat(pin)) return true;
  if (WEAK_PINS.has(pin)) return true;
  // All same digit
  if (/^(\d)\1{5}$/.test(pin)) return true;
  // Strict ascending/descending sequences
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return true;
  return false;
}

export function pinPolicyError(pin: string): string | null {
  if (!isValidPinFormat(pin)) return "PIN must be exactly 6 digits";
  if (isWeakPin(pin)) return "Choose a less predictable PIN — avoid sequences and repeated digits";
  return null;
}