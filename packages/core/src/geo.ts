const EARTH_RADIUS_METERS = 6_371_008.8

export interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function assertCoordinates(point: Coordinates): void {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new RangeError('Invalid coordinates')
  }
}

export function haversineDistanceMeters(from: Coordinates, to: Coordinates): number {
  assertCoordinates(from)
  assertCoordinates(to)
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export function isWithinRadius(distanceMeters: number, radiusMeters: number): boolean {
  if (distanceMeters < 0 || radiusMeters < 0) throw new RangeError('Distances cannot be negative')
  return distanceMeters <= radiusMeters
}
