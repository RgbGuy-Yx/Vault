const participantPrefixes = ["ghost", "ember", "nova", "drift", "atlas", "vector"];

function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }

  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] % max;
  }

  return Math.floor(Math.random() * max);
}

export function generateCodeName(prefixes: string[]): string {
  const prefix = prefixes[randomInt(prefixes.length)] ?? prefixes[0];
  const suffix = String(randomInt(10_000)).padStart(4, "0");

  return `${prefix}_${suffix}`;
}

export function generateParticipantName(): string {
  return generateCodeName(participantPrefixes);
}