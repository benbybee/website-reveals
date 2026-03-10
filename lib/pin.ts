import { createHash, randomInt } from "crypto";

export function generatePin(): string {
  return String(randomInt(100000, 999999));
}

export function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}
