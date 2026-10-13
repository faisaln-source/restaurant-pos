/**
 * Table service — CRUD via Express API.
 */
import api from '../lib/api';
import type { Table } from '../lib/types';

export async function fetchTables(): Promise<Table[]> {
  return api.get<Table[]>('/api/tables');
}

/** Legacy subscription-style API. Fetches once and calls cb. */
export function subscribeToTables(cb: (tables: Table[]) => void): () => void {
  let cancelled = false;
  fetchTables().then((tables) => {
    if (!cancelled) cb(tables);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export async function createTable(data: {
  name: string; capacity: number; floorSection: string; posX: number; posY: number;
}): Promise<Table> {
  return api.post<Table>('/api/tables', data);
}

export async function updateTable(id: string, data: Partial<Table>): Promise<Table> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = data as Table;
  return api.patch<Table>(`/api/tables/${id}`, rest);
}

export async function updateTableStatus(
  id: string,
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING',
  currentOrderId?: string,
): Promise<void> {
  await api.patch(`/api/tables/${id}/status`, { status, currentOrderId });
}

export async function deleteTable(id: string): Promise<void> {
  await api.delete(`/api/tables/${id}`);
}

export async function fetchFloorSections(): Promise<string[]> {
  return api.get<string[]>('/api/tables/sections');
}

export async function seedTables(): Promise<void> {
  const tables = [
    { name: 'T1',  capacity: 2,  floorSection: 'Ground Floor', posX: 48,  posY: 48  },
    { name: 'T2',  capacity: 4,  floorSection: 'Ground Floor', posX: 224, posY: 48  },
    { name: 'T3',  capacity: 4,  floorSection: 'Ground Floor', posX: 400, posY: 48  },
    { name: 'T4',  capacity: 6,  floorSection: 'Ground Floor', posX: 48,  posY: 168 },
    { name: 'T5',  capacity: 6,  floorSection: 'Ground Floor', posX: 224, posY: 168 },
    { name: 'T6',  capacity: 8,  floorSection: 'Ground Floor', posX: 400, posY: 168 },
    { name: 'B1',  capacity: 2,  floorSection: 'Bar',          posX: 48,  posY: 48 },
    { name: 'B2',  capacity: 2,  floorSection: 'Bar',          posX: 224, posY: 48 },
    { name: 'TR1', capacity: 4,  floorSection: 'Terrace',      posX: 48,  posY: 48 },
    { name: 'TR2', capacity: 4,  floorSection: 'Terrace',      posX: 224, posY: 48 },
  ];

  for (const t of tables) {
    await createTable(t);
  }
}
