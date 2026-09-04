-- CreateTable
CREATE TABLE "AssetTypeConfig" (
    "id" TEXT NOT NULL,
    "assetType" "MaintainableAssetType" NOT NULL,
    "positionId" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetTypeConfig_assetType_key" ON "AssetTypeConfig"("assetType");

-- AddForeignKey
ALTER TABLE "AssetTypeConfig" ADD CONSTRAINT "AssetTypeConfig_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
