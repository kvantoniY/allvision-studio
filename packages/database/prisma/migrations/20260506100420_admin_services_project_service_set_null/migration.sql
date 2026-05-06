-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_serviceId_fkey";

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "serviceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
