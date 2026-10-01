-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MEETING', 'INSPECTION', 'DEADLINE', 'ACTIVITY', 'OTHER');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "campus" "Campus",
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX "Event_endsAt_idx" ON "Event"("endsAt");
CREATE INDEX "Event_type_idx" ON "Event"("type");
CREATE INDEX "Event_campus_idx" ON "Event"("campus");
CREATE INDEX "Event_isActive_idx" ON "Event"("isActive");
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");

ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
