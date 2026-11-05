import api from '../lib/api';
import type { KitchenStation } from '../lib/types';

export async function fetchKitchenStations(): Promise<KitchenStation[]> {
  return api.get<KitchenStation[]>('/api/kitchen-stations');
}

export async function createKitchenStation(data: {
  name: string;
  description?: string;
  color: string;
  displayOrder?: number;
}): Promise<KitchenStation> {
  return api.post<KitchenStation>('/api/kitchen-stations', data);
}

export async function updateKitchenStation(
  id: string,
  data: Partial<{ name: string; description: string; color: string; isActive: boolean; displayOrder: number }>
): Promise<KitchenStation> {
  return api.patch<KitchenStation>(`/api/kitchen-stations/${id}`, data);
}

export async function deleteKitchenStation(id: string): Promise<void> {
  await api.delete(`/api/kitchen-stations/${id}`);
}

export async function fetchStationOrders(stationId: string, activeOnly = true) {
  return api.get<any[]>(`/api/kitchen-stations/${stationId}/orders?activeOnly=${activeOnly}`);
}
