-- CreateTable
CREATE TABLE IF NOT EXISTS "section_charges" (
    "id" TEXT NOT NULL,
    "floor_section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_percent" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "kitchen_stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- AlterTable menu_items
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "kitchen_station_id" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "is_variable_price" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "daily_price" DECIMAL(10,2);
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "day_prices" JSONB;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "daily_price_date" TEXT;

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "extra_charges" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "extra_charges_detail" JSONB;

-- AlterTable order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "seat_number" INTEGER;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_kitchen_station_id_fkey'
    ) THEN
        ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_kitchen_station_id_fkey"
            FOREIGN KEY ("kitchen_station_id") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
