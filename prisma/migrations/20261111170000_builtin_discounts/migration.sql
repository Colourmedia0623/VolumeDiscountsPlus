-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "builtinDiscountIds" TEXT;

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "discountEngine" TEXT;
