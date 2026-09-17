-- CreateTable
CREATE TABLE "Click" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Click_deliveryId_idx" ON "Click"("deliveryId");

-- CreateIndex
CREATE INDEX "Click_link_idx" ON "Click"("link");

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
