import prisma from '../../lib/prisma';
import { notFoundError } from '../../lib/errors';
import { Decimal } from '@prisma/client/runtime/library';

export interface SectionChargeInput {
  floorSection: string;
  label: string;
  amount: number;
  isPercent?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}

export async function listSectionCharges(floorSection?: string) {
  return prisma.sectionCharge.findMany({
    where: floorSection ? { floorSection } : undefined,
    orderBy: [{ floorSection: 'asc' }, { displayOrder: 'asc' }],
  });
}

export async function listActiveSectionCharges(floorSection: string) {
  return prisma.sectionCharge.findMany({
    where: { floorSection, isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
}

export async function createSectionCharge(input: SectionChargeInput) {
  return prisma.sectionCharge.create({
    data: {
      floorSection: input.floorSection,
      label: input.label,
      amount: new Decimal(input.amount),
      isPercent: input.isPercent ?? false,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateSectionCharge(id: string, input: Partial<SectionChargeInput>) {
  const existing = await prisma.sectionCharge.findUnique({ where: { id } });
  if (!existing) throw notFoundError('Section charge not found');
  return prisma.sectionCharge.update({
    where: { id },
    data: {
      ...(input.floorSection !== undefined && { floorSection: input.floorSection }),
      ...(input.label !== undefined && { label: input.label }),
      ...(input.amount !== undefined && { amount: new Decimal(input.amount) }),
      ...(input.isPercent !== undefined && { isPercent: input.isPercent }),
      ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteSectionCharge(id: string) {
  const existing = await prisma.sectionCharge.findUnique({ where: { id } });
  if (!existing) throw notFoundError('Section charge not found');
  return prisma.sectionCharge.delete({ where: { id } });
}

/**
 * Compute extra charges for a floor section given the order subtotal.
 * Fixed-amount charges add directly; percent charges are % of subtotal.
 */
export async function computeSectionCharges(
  floorSection: string | null | undefined,
  subtotal: Decimal
): Promise<{ total: Decimal; detail: Array<{ label: string; amount: number; isPercent: boolean; originalRate: number }> }> {
  if (!floorSection) return { total: new Decimal(0), detail: [] };

  const charges = await listActiveSectionCharges(floorSection);
  const detail: Array<{ label: string; amount: number; isPercent: boolean; originalRate: number }> = [];
  let total = new Decimal(0);

  for (const charge of charges) {
    const resolvedAmount = charge.isPercent
      ? subtotal.mul(charge.amount).div(100)
      : charge.amount;
    total = total.add(resolvedAmount);
    detail.push({
      label: charge.label,
      amount: Number(resolvedAmount.toFixed(2)),
      isPercent: charge.isPercent,
      originalRate: Number(charge.amount),
    });
  }

  return { total, detail };
}

