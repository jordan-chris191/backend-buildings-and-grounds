-- AlterTable
ALTER TABLE "User" ADD COLUMN     "officeId" TEXT;

-- CreateIndex
CREATE INDEX "User_officeId_idx" ON "User"("officeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;
