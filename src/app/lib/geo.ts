export const PH_CENTER: [number, number] = [12.8797, 121.774];

/**
 * Approximate bounding box for the Philippines (to lock/clip panning).
 * Includes far-north (Batanes) and far-south (Tawi-Tawi) with a small buffer.
 */
export const PH_BOUNDS = {
  southWest: [4.4, 116.0] as [number, number],
  northEast: [21.6, 127.3] as [number, number],
};

// Mock coordinates for Philippine locations (extend as needed)
const LOCATION_COORDINATES: Record<string, [number, number]> = {
  'Metro Manila': [14.5995, 120.9842],
  'Marikina, Metro Manila': [14.6507, 121.1029],
  'Quezon City, Metro Manila': [14.676, 121.0437],
  'Tacloban City, Leyte': [11.2445, 125.0032],
  'Cebu City, Cebu': [10.3157, 123.8854],
  'Davao City, Davao del Sur': [7.1907, 125.4553],
  'Albay (Mayon area)': [13.2578, 123.6856],
};

const fnv1a32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Deterministic, "fuzzy" coordinate lookup:
 * - exact match
 * - partial match
 * - stable pseudo-random offset around PH center (so markers don't jump every render)
 */
export const getApproxCoordinates = (location: string): [number, number] => {
  // exact match first
  if (LOCATION_COORDINATES[location]) return LOCATION_COORDINATES[location];

  // partial match
  for (const [key, coords] of Object.entries(LOCATION_COORDINATES)) {
    if (
      location.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(location.toLowerCase())
    ) {
      return coords;
    }
  }

  // deterministic offset around PH center
  const rand = mulberry32(fnv1a32(location.trim().toLowerCase()));
  const latOffset = (rand() - 0.5) * 0.9;
  const lngOffset = (rand() - 0.5) * 0.9;

  return [PH_CENTER[0] + latOffset, PH_CENTER[1] + lngOffset];
};

export const coordsKey = (coords: [number, number]) =>
  `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;


