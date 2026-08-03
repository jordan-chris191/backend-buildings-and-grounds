/*
  Warnings:

  - Added the required column `campus` to the `InventoryItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campus` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campus` to the `WorkRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Campus" AS ENUM ('MC1', 'MC2', 'PAMPLONA');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('CONSTRUCTION', 'RENOVATION', 'FABRICATION');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "campus" "Campus" NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "campus" "Campus" NOT NULL,
ADD COLUMN     "type" "ProjectType" NOT NULL;

-- AlterTable
ALTER TABLE "WorkRequest" ADD COLUMN     "campus" "Campus" NOT NULL;
