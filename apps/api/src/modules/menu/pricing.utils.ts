import { Decimal } from '@prisma/client/runtime/library';

export const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export function getTodayDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentDayName(date = new Date()): DayOfWeek {
  return DAYS_OF_WEEK[date.getDay()];
}

export function calculateEffectiveItemPrice(
  item: {
    price: Decimal | number;
    isVariablePrice?: boolean | null;
    dailyPrice?: Decimal | number | null;
    dayPrices?: any;
    dailyPriceDate?: string | null;
  },
  date = new Date()
): Decimal {
  const basePrice = item.price instanceof Decimal ? item.price : new Decimal(item.price);

  if (!item.isVariablePrice) {
    return basePrice;
  }

  const todayStr = getTodayDateString(date);
  const currentDay = getCurrentDayName(date);

  // 1. If dailyPrice was explicitly updated for today (Daily Price Board override)
  if (item.dailyPriceDate === todayStr && item.dailyPrice !== null && item.dailyPrice !== undefined) {
    return item.dailyPrice instanceof Decimal ? item.dailyPrice : new Decimal(item.dailyPrice);
  }

  // 2. Check day-of-week breakdown (e.g. dayPrices['tuesday'])
  if (item.dayPrices && typeof item.dayPrices === 'object' && !Array.isArray(item.dayPrices)) {
    const rawDayPrice = (item.dayPrices as Record<string, any>)[currentDay];
    if (rawDayPrice !== undefined && rawDayPrice !== null && !isNaN(Number(rawDayPrice))) {
      return new Decimal(rawDayPrice);
    }
  }

  // 3. Fall back to dailyPrice if set, or base price
  if (item.dailyPrice !== null && item.dailyPrice !== undefined) {
    return item.dailyPrice instanceof Decimal ? item.dailyPrice : new Decimal(item.dailyPrice);
  }

  return basePrice;
}
