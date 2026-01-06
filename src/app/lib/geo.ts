export const PH_CENTER: [number, number] = [12.8797, 121.774];

/**
 * Approximate bounding box for the Philippines (to lock/clip panning).
 * Includes far-north (Batanes) and far-south (Tawi-Tawi) with a small buffer.
 */
export const PH_BOUNDS = {
  southWest: [4.4, 116.0] as [number, number],
  northEast: [21.6, 127.3] as [number, number],
};

export const coordsKey = (coords: [number, number]) =>
  `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;

export const formatCoordinates = (coords?: [number, number] | null) => {
  if (!coords) return 'Unknown location';
  return `Near ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
};

