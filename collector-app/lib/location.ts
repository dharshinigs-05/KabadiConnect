import * as Location from 'expo-location';

export type CapturedLocation = { lat: number; lng: number; captured_at: string };

export async function captureLocation(): Promise<CapturedLocation> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission was not granted.');
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error('Turn on device location to continue.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: position.coords.latitude, lng: position.coords.longitude, captured_at: new Date(position.timestamp).toISOString() };
}
