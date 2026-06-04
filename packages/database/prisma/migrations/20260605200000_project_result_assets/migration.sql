-- Multi-output project results (e.g. carousel slides): array of { type, url, label? }.
ALTER TABLE "Project" ADD COLUMN "resultAssets" JSONB;
