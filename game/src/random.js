// A small seeded random number generator (mulberry32) plus a few helpers: the same seed gives the
// same game, which is what makes the screenshot scenes repeatable and the world reproducible.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random number in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random integer in [min, max] (inclusive). */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** A random element of a non-empty array. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** True with probability p. */
export function chance(random, p) {
  return random() < p;
}
