import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Admin user ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 12);
  const adminPin = await bcrypt.hash('0000', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@restaurant.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@restaurant.com',
      passwordHash: adminHash,
      pin: adminPin,
      role: Role.ADMIN,
    },
  });
  console.log(`✅ Admin: ${admin.email} (password: admin123, pin: 0000)`);

  // ── Manager ─────────────────────────────────────────────────────────────
  const managerHash = await bcrypt.hash('manager123', 12);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@restaurant.com' },
    update: {},
    create: {
      name: 'Manager User',
      email: 'manager@restaurant.com',
      passwordHash: managerHash,
      role: Role.MANAGER,
    },
  });
  console.log(`✅ Manager: ${manager.email} (password: manager123)`);

  // ── Cashier ─────────────────────────────────────────────────────────────
  const cashierHash = await bcrypt.hash('cashier123', 12);
  const cashierPin = await bcrypt.hash('1234', 12);
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@restaurant.com' },
    update: {},
    create: {
      name: 'Cashier User',
      email: 'cashier@restaurant.com',
      passwordHash: cashierHash,
      pin: cashierPin,
      role: Role.CASHIER,
    },
  });
  console.log(`✅ Cashier: ${cashier.email} (password: cashier123, pin: 1234)`);

  // ── Kitchen Staff ────────────────────────────────────────────────────────
  const kitchenHash = await bcrypt.hash('kitchen123', 12);
  const kitchenPin = await bcrypt.hash('5678', 12);
  await prisma.user.upsert({
    where: { email: 'kitchen@restaurant.com' },
    update: {},
    create: {
      name: 'Kitchen Staff',
      email: 'kitchen@restaurant.com',
      passwordHash: kitchenHash,
      pin: kitchenPin,
      role: Role.KITCHEN,
    },
  });
  console.log(`✅ Kitchen: kitchen@restaurant.com (password: kitchen123, pin: 5678)`);

  // ── Waiter ───────────────────────────────────────────────────────────────
  const waiterHash = await bcrypt.hash('waiter123', 12);
  const waiterPin = await bcrypt.hash('9999', 12);
  await prisma.user.upsert({
    where: { email: 'waiter@restaurant.com' },
    update: {},
    create: {
      name: 'Waiter User',
      email: 'waiter@restaurant.com',
      passwordHash: waiterHash,
      pin: waiterPin,
      role: Role.WAITER,
    },
  });
  console.log(`✅ Waiter: waiter@restaurant.com (password: waiter123, pin: 9999)`);

  // ── Tables ────────────────────────────────────────────────────────────────
  const tables = [
    { name: 'T1', capacity: 2, floorSection: 'Ground Floor', posX: 48, posY: 48 },
    { name: 'T2', capacity: 4, floorSection: 'Ground Floor', posX: 224, posY: 48 },
    { name: 'T3', capacity: 4, floorSection: 'Ground Floor', posX: 400, posY: 48 },
    { name: 'T4', capacity: 6, floorSection: 'Ground Floor', posX: 48, posY: 168 },
    { name: 'T5', capacity: 6, floorSection: 'Ground Floor', posX: 224, posY: 168 },
    { name: 'T6', capacity: 8, floorSection: 'Ground Floor', posX: 400, posY: 168 },
    { name: 'Bar-1', capacity: 2, floorSection: 'Bar', posX: 48, posY: 48 },
    { name: 'Bar-2', capacity: 2, floorSection: 'Bar', posX: 224, posY: 48 },
    { name: 'Terrace-1', capacity: 4, floorSection: 'Terrace', posX: 48, posY: 48 },
    { name: 'Terrace-2', capacity: 4, floorSection: 'Terrace', posX: 224, posY: 48 },
  ];

  await prisma.table.createMany({ data: tables, skipDuplicates: true });
  console.log(`\n✅ Created ${tables.length} tables`);

  // ── Menu Categories ───────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({ where: { id: 'cat-starters' }, update: {}, create: { id: 'cat-starters', name: 'Starters', icon: '🥗', displayOrder: 1 } }),
    prisma.category.upsert({ where: { id: 'cat-mains' }, update: {}, create: { id: 'cat-mains', name: 'Main Course', icon: '🍽️', displayOrder: 2 } }),
    prisma.category.upsert({ where: { id: 'cat-pizza' }, update: {}, create: { id: 'cat-pizza', name: 'Pizza', icon: '🍕', displayOrder: 3 } }),
    prisma.category.upsert({ where: { id: 'cat-pasta' }, update: {}, create: { id: 'cat-pasta', name: 'Pasta', icon: '🍝', displayOrder: 4 } }),
    prisma.category.upsert({ where: { id: 'cat-desserts' }, update: {}, create: { id: 'cat-desserts', name: 'Desserts', icon: '🍰', displayOrder: 5 } }),
    prisma.category.upsert({ where: { id: 'cat-drinks' }, update: {}, create: { id: 'cat-drinks', name: 'Drinks', icon: '🥤', displayOrder: 6 } }),
  ]);
  console.log(`✅ Created ${categories.length} categories`);

  // ── Menu Items ────────────────────────────────────────────────────────────
  const menuItems = [
    // Starters
    { id: 'item-garlic-bread', categoryId: 'cat-starters', name: 'Garlic Bread', price: 4.99, isVeg: true, preparationTime: 5, imageUrl: 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-bruschetta', categoryId: 'cat-starters', name: 'Bruschetta', price: 6.99, isVeg: true, preparationTime: 7, imageUrl: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-calamari', categoryId: 'cat-starters', name: 'Calamari', price: 9.99, isVeg: false, preparationTime: 10, imageUrl: 'https://images.unsplash.com/photo-1604909052743-94e838986d24?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-soup', categoryId: 'cat-starters', name: 'Tomato Soup', price: 5.99, isVeg: true, preparationTime: 8, imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80' },
    // Mains
    { id: 'item-steak', categoryId: 'cat-mains', name: 'Grilled Steak', price: 24.99, isVeg: false, preparationTime: 20, imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-salmon', categoryId: 'cat-mains', name: 'Pan Seared Salmon', price: 19.99, isVeg: false, preparationTime: 15, imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-risotto', categoryId: 'cat-mains', name: 'Mushroom Risotto', price: 14.99, isVeg: true, preparationTime: 18, imageUrl: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=600&auto=format&fit=crop&q=80' },
    // Pizza
    { id: 'item-margherita', categoryId: 'cat-pizza', name: 'Margherita', price: 12.99, isVeg: true, preparationTime: 12, imageUrl: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-pepperoni', categoryId: 'cat-pizza', name: 'Pepperoni', price: 14.99, isVeg: false, preparationTime: 12, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-bbq-chicken', categoryId: 'cat-pizza', name: 'BBQ Chicken', price: 15.99, isVeg: false, preparationTime: 14, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-veggie', categoryId: 'cat-pizza', name: 'Veggie Supreme', price: 13.99, isVeg: true, preparationTime: 12, imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80' },
    // Pasta
    { id: 'item-carbonara', categoryId: 'cat-pasta', name: 'Carbonara', price: 13.99, isVeg: false, preparationTime: 12, imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-arrabiata', categoryId: 'cat-pasta', name: 'Arrabiata', price: 11.99, isVeg: true, preparationTime: 10, imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-alfredo', categoryId: 'cat-pasta', name: 'Fettuccine Alfredo', price: 12.99, isVeg: true, preparationTime: 12, imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80' },
    // Desserts
    { id: 'item-tiramisu', categoryId: 'cat-desserts', name: 'Tiramisu', price: 6.99, isVeg: true, preparationTime: 3, imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-cheesecake', categoryId: 'cat-desserts', name: 'Cheesecake', price: 5.99, isVeg: true, preparationTime: 3, imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-gelato', categoryId: 'cat-desserts', name: 'Gelato', price: 4.99, isVeg: true, preparationTime: 2, imageUrl: 'https://images.unsplash.com/photo-1560008511-11c63416e52d?w=600&auto=format&fit=crop&q=80' },
    // Drinks
    { id: 'item-cola', categoryId: 'cat-drinks', name: 'Cola', price: 2.99, isVeg: true, preparationTime: 1, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-water', categoryId: 'cat-drinks', name: 'Sparkling Water', price: 1.99, isVeg: true, preparationTime: 1, imageUrl: 'https://images.unsplash.com/photo-1559839914-1b3164538b5e?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-juice', categoryId: 'cat-drinks', name: 'Fresh Orange Juice', price: 3.99, isVeg: true, preparationTime: 3, imageUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-coffee', categoryId: 'cat-drinks', name: 'Espresso', price: 2.49, isVeg: true, preparationTime: 4, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80' },
    { id: 'item-wine', categoryId: 'cat-drinks', name: 'House Red Wine', price: 7.99, isVeg: true, preparationTime: 2, imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80' },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }
  console.log(`✅ Created ${menuItems.length} menu items`);

  console.log('\n🎉 Seed complete!\n');
  console.log('─────────────────────────────────────');
  console.log('Quick Login Credentials:');
  console.log('  Admin    → admin@restaurant.com / admin123 / PIN: 0000');
  console.log('  Manager  → manager@restaurant.com / manager123');
  console.log('  Cashier  → cashier@restaurant.com / cashier123 / PIN: 1234');
  console.log('  Kitchen  → kitchen@restaurant.com / kitchen123 / PIN: 5678');
  console.log('  Waiter   → waiter@restaurant.com / waiter123 / PIN: 9999');
  console.log('─────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
