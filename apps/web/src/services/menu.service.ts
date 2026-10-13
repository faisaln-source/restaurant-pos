/**
 * Menu service — categories & items CRUD via Express API.
 * Subscriptions are replaced with useLiveData hook (fetch + Socket.IO).
 */
import api from '../lib/api';
import type { MenuCategory, MenuItem } from '../lib/types';

// ── Categories ─────────────────────────────────────────────────────────────

// Prisma Decimal fields come back as strings over JSON — coerce to number
function normalizeMenuItem(item: MenuItem): MenuItem {
  return { ...item, price: Number(item.price) };
}

export async function fetchCategories(): Promise<MenuCategory[]> {
  return api.get<MenuCategory[]>('/api/menu/categories');
}

/** Legacy subscription-style API. Fetches once and calls cb. */
export function subscribeToCategories(cb: (cats: MenuCategory[]) => void): () => void {
  let cancelled = false;
  fetchCategories().then((cats) => {
    if (!cancelled) cb(cats);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export async function createCategory(data: {
  name: string; icon?: string; displayOrder: number;
}): Promise<MenuCategory> {
  return api.post<MenuCategory>('/api/menu/categories', data);
}

export async function updateCategory(id: string, data: Partial<MenuCategory>): Promise<MenuCategory> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = data as MenuCategory;
  return api.patch<MenuCategory>(`/api/menu/categories/${id}`, rest);
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/api/menu/categories/${id}`);
}

// ── Menu Items ─────────────────────────────────────────────────────────────

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const items = await api.get<MenuItem[]>('/api/menu/items');
  return items.map(normalizeMenuItem);
}

/** Legacy subscription-style API. Fetches once and calls cb. */
export function subscribeToMenuItems(cb: (items: MenuItem[]) => void): () => void {
  let cancelled = false;
  fetchMenuItems().then((items) => {
    if (!cancelled) cb(items);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export async function createMenuItem(
  data: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<MenuItem> {
  const item = await api.post<MenuItem>('/api/menu/items', data);
  return normalizeMenuItem(item);
}

export async function updateMenuItem(id: string, data: Partial<MenuItem>): Promise<MenuItem> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = data as MenuItem;
  const item = await api.patch<MenuItem>(`/api/menu/items/${id}`, rest);
  return normalizeMenuItem(item);
}

export async function deleteMenuItem(id: string, _imageUrl?: string): Promise<void> {
  await api.delete(`/api/menu/items/${id}`);
}

export async function toggleItemAvailability(id: string, isAvailable: boolean): Promise<void> {
  await api.patch(`/api/menu/items/${id}/availability`, { isAvailable });
}

// ── Image Upload ───────────────────────────────────────────────────────────
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { storage, auth } from '../lib/firebase';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

async function uploadToBackend(file: File): Promise<string> {
  const base64 = await fileToBase64(file);
  const res = await api.post<{ success: boolean; url: string }>('/api/menu/upload', {
    image: base64,
  });
  return res.url;
}

/**
 * Uploads menu image to Firebase Storage with real-time progress callbacks.
 * If Firebase Storage is unavailable or restricted, seamlessly falls back to the server.
 */
export async function uploadMenuImage(
  file: File,
  itemId: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  try {
    // Ensure auth session exists if required by Firebase rules
    if (!auth.currentUser) {
      await signInAnonymously(auth).catch(() => {});
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const cleanId = (itemId || 'dish').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `menu-items/${cleanId}_${Date.now()}.${fileExt}`;
    const storageRef = ref(storage, fileName);

    const uploadTask = uploadBytesResumable(storageRef, file);

    const downloadUrl = await new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            if (onProgress) onProgress(progress);
          }
        },
        (error) => {
          reject(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }
      );
    });

    return downloadUrl;
  } catch (firebaseErr) {
    console.warn('Firebase Storage upload failed, using server upload fallback:', firebaseErr);
    if (onProgress) onProgress(40);
    const backendUrl = await uploadToBackend(file);
    if (onProgress) onProgress(100);
    return backendUrl;
  }
}

// ── Seed initial menu data ─────────────────────────────────────────────────
export async function seedMenuData(): Promise<void> {
  // Seed categories
  const categories = [
    { name: 'Starters',    icon: '🥗', displayOrder: 1 },
    { name: 'Main Course', icon: '🍽️', displayOrder: 2 },
    { name: 'Pizza',       icon: '🍕', displayOrder: 3 },
    { name: 'Pasta',       icon: '🍝', displayOrder: 4 },
    { name: 'Desserts',    icon: '🍰', displayOrder: 5 },
    { name: 'Drinks',      icon: '🥤', displayOrder: 6 },
  ];

  const catIds: Record<string, string> = {};
  for (const cat of categories) {
    const created = await createCategory(cat);
    catIds[cat.name] = created.id;
  }

  const items = [
    { category: 'Starters',    name: 'Garlic Bread',        price: 4.99,  isVeg: true,  preparationTime: 5,  displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?w=600&auto=format&fit=crop&q=80' },
    { category: 'Starters',    name: 'Bruschetta',           price: 6.99,  isVeg: true,  preparationTime: 7,  displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&auto=format&fit=crop&q=80' },
    { category: 'Starters',    name: 'Calamari',             price: 9.99,  isVeg: false, preparationTime: 10, displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1604909052743-94e838986d24?w=600&auto=format&fit=crop&q=80' },
    { category: 'Starters',    name: 'Tomato Soup',          price: 5.99,  isVeg: true,  preparationTime: 8,  displayOrder: 4, imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80' },
    { category: 'Main Course', name: 'Grilled Steak',        price: 24.99, isVeg: false, preparationTime: 20, displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80' },
    { category: 'Main Course', name: 'Pan Seared Salmon',    price: 19.99, isVeg: false, preparationTime: 15, displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80' },
    { category: 'Main Course', name: 'Mushroom Risotto',     price: 14.99, isVeg: true,  preparationTime: 18, displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pizza',       name: 'Margherita',           price: 12.99, isVeg: true,  preparationTime: 12, displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pizza',       name: 'Pepperoni',            price: 14.99, isVeg: false, preparationTime: 12, displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pizza',       name: 'BBQ Chicken',          price: 15.99, isVeg: false, preparationTime: 14, displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pizza',       name: 'Veggie Supreme',       price: 13.99, isVeg: true,  preparationTime: 12, displayOrder: 4, imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pasta',       name: 'Carbonara',            price: 13.99, isVeg: false, preparationTime: 12, displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pasta',       name: 'Arrabiata',            price: 11.99, isVeg: true,  preparationTime: 10, displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=600&auto=format&fit=crop&q=80' },
    { category: 'Pasta',       name: 'Fettuccine Alfredo',   price: 12.99, isVeg: true,  preparationTime: 12, displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80' },
    { category: 'Desserts',    name: 'Tiramisu',             price: 6.99,  isVeg: true,  preparationTime: 3,  displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80' },
    { category: 'Desserts',    name: 'Cheesecake',           price: 5.99,  isVeg: true,  preparationTime: 3,  displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80' },
    { category: 'Desserts',    name: 'Gelato',               price: 4.99,  isVeg: true,  preparationTime: 2,  displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1560008511-11c63416e52d?w=600&auto=format&fit=crop&q=80' },
    { category: 'Drinks',      name: 'Cola',                 price: 2.99,  isVeg: true,  preparationTime: 1,  displayOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80' },
    { category: 'Drinks',      name: 'Sparkling Water',      price: 1.99,  isVeg: true,  preparationTime: 1,  displayOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1559839914-1b3164538b5e?w=600&auto=format&fit=crop&q=80' },
    { category: 'Drinks',      name: 'Fresh Orange Juice',   price: 3.99,  isVeg: true,  preparationTime: 3,  displayOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80' },
    { category: 'Drinks',      name: 'Espresso',             price: 2.49,  isVeg: true,  preparationTime: 4,  displayOrder: 4, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80' },
    { category: 'Drinks',      name: 'House Red Wine',       price: 7.99,  isVeg: true,  preparationTime: 2,  displayOrder: 5, imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80' },
  ];

  for (const item of items) {
    const { category, ...rest } = item;
    await createMenuItem({
      ...rest,
      categoryId: catIds[category],
      categoryName: category,
      isAvailable: true,
      description: '',
    });
  }
}

export { seedMenuData as seedMenu };

