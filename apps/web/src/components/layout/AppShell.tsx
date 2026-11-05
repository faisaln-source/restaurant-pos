import { useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Header from './Header';
import './AppShell.css';
import { useSocketEvent } from '../../lib/socket';
import { printKitchenTicket } from '../../lib/kitchenTicket';
import type { Order } from '../../lib/types';

/** Normalise the raw Prisma socket payload to the client Order shape */
function normaliseOrder(raw: any): Order {
  return {
    ...raw,
    tableName:      raw.table?.name    ?? raw.tableName    ?? undefined,
    userName:       raw.user?.name     ?? raw.userName     ?? '',
    totalAmount:    Number(raw.totalAmount    ?? 0),
    subtotal:       Number(raw.subtotal       ?? raw.totalAmount ?? 0),
    taxAmount:      Number(raw.taxAmount      ?? 0),
    taxRate:        Number(raw.taxRate        ?? 5),
    discountAmount: Number(raw.discountAmount ?? 0),
    items: (raw.items ?? []).map((i: any) => ({
      ...i,
      menuItemName: i.menuItem?.name ?? i.menuItemName ?? 'Item',
      unitPrice:    Number(i.unitPrice  ?? 0),
      totalPrice:   Number(i.totalPrice ?? 0),
    })),
  };
}

/** Global auto-print hook — fires from any page when an order is placed */
function useKitchenAutoPrint() {
  const onNewOrder = useCallback((raw: any) => {
    const order = normaliseOrder(raw);
    printKitchenTicket(order);
    toast('🖨️ Printing kitchen ticket…', { duration: 2500 });
  }, []);

  useSocketEvent<any>('order:new', onNewOrder);
}

export default function AppShell() {
  useKitchenAutoPrint();

  return (
    <div className="app-layout flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="main-content flex flex-1 flex-col overflow-hidden min-w-0 h-full">
        <Header />
        <main className="page-content flex-1 overflow-y-auto p-6 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

