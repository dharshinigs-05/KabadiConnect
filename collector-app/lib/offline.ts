import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const queueKey = 'kc-native-pending-lots';
const imageDirectory = `${FileSystem.documentDirectory}pending-lot-images/`;

export type PendingLot = {
  client_uuid: string;
  material_category: string;
  estimated_weight_kg: number;
  condition: 'good' | 'damaged' | 'mixed';
  location: { lat: number; lng: number };
  image_uris: string[];
  created_at: string;
};

async function ensureImageDirectory() { await FileSystem.makeDirectoryAsync(imageDirectory, { intermediates: true }); }

export async function persistImage(sourceUri: string): Promise<string> {
  await ensureImageDirectory();
  const destination = `${imageDirectory}${Crypto.randomUUID()}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function pendingLots(): Promise<PendingLot[]> {
  return JSON.parse((await AsyncStorage.getItem(queueKey)) ?? '[]') as PendingLot[];
}

export async function enqueueLot(lot: PendingLot): Promise<void> {
  await AsyncStorage.setItem(queueKey, JSON.stringify([...(await pendingLots()), lot]));
}

export async function removePendingLot(clientUuid: string): Promise<void> {
  const remaining = (await pendingLots()).filter(lot => lot.client_uuid !== clientUuid);
  await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
}
