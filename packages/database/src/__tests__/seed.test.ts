const mockMigrateMediaAssets = jest.fn();
const mockHash = jest.fn(async (password: string) => `hash:${password}`);

type MockUser = {
  email: string;
  passwordHash: string;
  name?: string;
  role: string;
  tokenBalance: number;
  deletedAt?: Date | null;
};

type MockService = {
  id: string;
  slug: string;
  [key: string]: unknown;
};

const mockState = {
  users: new Map<string, MockUser>(),
  services: new Map<string, MockService>(),
  tokenPackageCount: 0,
  settings: new Set<string>(),
  trendsCount: 0,
  scenarioTemplates: new Set<string>(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  service: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  trend: {
    count: jest.fn(),
    createMany: jest.fn(),
  },
  scenarioTemplate: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  tokenPackage: {
    count: jest.fn(),
    createMany: jest.fn(),
  },
  setting: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  stylePreset: {
    upsert: jest.fn(),
  },
  $executeRawUnsafe: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('../index', () => ({
  prisma: mockPrisma,
  ProcessingType: {
    AUTO: 'AUTO',
    MANUAL: 'MANUAL',
  },
  ServiceCategory: {
    PHOTO_RESTORE: 'PHOTO_RESTORE',
    PHOTO_ANIMATE: 'PHOTO_ANIMATE',
    TREND: 'TREND',
    CARTOON_CUSTOM: 'CARTOON_CUSTOM',
    REALISTIC_CUSTOM: 'REALISTIC_CUSTOM',
  },
}));

jest.mock('../migrate-media-assets', () => ({
  migrateMediaAssets: mockMigrateMediaAssets,
}));

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hash: mockHash,
  },
}));

import { runSeed } from '../seed';

const envKeys = [
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_INITIAL_EMAIL',
  'ADMIN_INITIAL_PASSWORD',
  'READONLY_ADMIN_EMAIL',
  'READONLY_ADMIN_PASSWORD',
];

function resetState() {
  mockState.users.clear();
  mockState.services.clear();
  mockState.tokenPackageCount = 0;
  mockState.settings.clear();
  mockState.trendsCount = 0;
  mockState.scenarioTemplates.clear();
  mockMigrateMediaAssets.mockResolvedValue(0);

  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) => (
    mockState.users.get(where.email) ?? null
  ));
  mockPrisma.user.create.mockImplementation(async ({ data }: { data: MockUser }) => {
    mockState.users.set(data.email, { ...data, deletedAt: data.deletedAt ?? null });
    return mockState.users.get(data.email);
  });
  mockPrisma.user.update.mockImplementation(async ({ where, data }: { where: { email: string }; data: Partial<MockUser> }) => {
    const existing = mockState.users.get(where.email);
    if (!existing) throw new Error(`Missing mock user ${where.email}`);
    const updated = { ...existing, ...data };
    mockState.users.set(where.email, updated);
    return updated;
  });

  mockPrisma.service.count.mockImplementation(async () => mockState.services.size);
  mockPrisma.service.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => (
    mockState.services.get(where.slug) ?? null
  ));
  mockPrisma.service.create.mockImplementation(async ({ data }: { data: { slug: string } }) => {
    const created = { ...data, id: `service-${data.slug}` };
    mockState.services.set(data.slug, created);
    return created;
  });
  mockPrisma.service.update.mockImplementation(async ({ where, data }: { where: { slug: string }; data: Record<string, unknown> }) => {
    const existing = mockState.services.get(where.slug) ?? { id: `service-${where.slug}`, slug: where.slug };
    const updated = { ...existing, ...data };
    mockState.services.set(where.slug, updated);
    return updated;
  });

  mockPrisma.trend.count.mockImplementation(async () => mockState.trendsCount);
  mockPrisma.trend.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => {
    mockState.trendsCount += data.length;
    return { count: data.length };
  });

  mockPrisma.scenarioTemplate.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => (
    mockState.scenarioTemplates.has(where.slug) ? { slug: where.slug } : null
  ));
  mockPrisma.scenarioTemplate.create.mockImplementation(async ({ data }: { data: { slug: string } }) => {
    mockState.scenarioTemplates.add(data.slug);
    return data;
  });

  mockPrisma.tokenPackage.count.mockImplementation(async () => mockState.tokenPackageCount);
  mockPrisma.tokenPackage.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => {
    mockState.tokenPackageCount = data.length;
    return { count: data.length };
  });

  mockPrisma.setting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (
    mockState.settings.has(where.key) ? { key: where.key } : null
  ));
  mockPrisma.setting.create.mockImplementation(async ({ data }: { data: { key: string } }) => {
    mockState.settings.add(data.key);
    return data;
  });
}

function setSystemEnv(readonlyPassword?: string) {
  process.env.ADMIN_EMAIL = 'admin@allvision-pulse.ru';
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.READONLY_ADMIN_EMAIL = 'claude-readonly@allvision-pulse.ru';
  if (readonlyPassword) {
    process.env.READONLY_ADMIN_PASSWORD = readonlyPassword;
  } else {
    delete process.env.READONLY_ADMIN_PASSWORD;
  }
}

describe('seed system users', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    envKeys.forEach((key) => delete process.env[key]);
    resetState();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('creates seed objects on an empty database', async () => {
    setSystemEnv('readonly-secret');

    await runSeed({ includeDevCatalog: true });

    expect(mockState.users.get('admin@allvision-pulse.ru')?.role).toBe('ADMIN');
    expect(mockState.users.get('claude-readonly@allvision-pulse.ru')?.role).toBe('READONLY_ADMIN');
    expect(mockPrisma.service.create).toHaveBeenCalled();
    expect(mockPrisma.trend.createMany).toHaveBeenCalled();
    expect(mockPrisma.scenarioTemplate.create).toHaveBeenCalled();
    expect(mockPrisma.tokenPackage.createMany).toHaveBeenCalled();
    expect(mockState.settings.size).toBeGreaterThan(0);
    expect(mockMigrateMediaAssets).toHaveBeenCalledTimes(1);
  });

  it('creates allowlisted gift services on first run and refreshes them idempotently', async () => {
    setSystemEnv('readonly-secret');
    await runSeed();
    const sizeAfterFirst = mockState.services.size;
    // Normal (prod) runs create the allowlisted data-driven services that are missing.
    expect(sizeAfterFirst).toBeGreaterThan(0);
    // On the first run they are created, not updated.
    expect(mockPrisma.service.update).not.toHaveBeenCalled();

    mockPrisma.user.findUnique.mockClear();
    mockPrisma.service.create.mockClear();
    mockPrisma.service.update.mockClear();

    await runSeed();

    // Second run: nothing new created and the service count is stable; allowlisted services are
    // refreshed in place (update), but no services are added or removed.
    expect(mockState.services.size).toBe(sizeAfterFirst);
    expect(mockPrisma.service.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'claude-readonly@allvision-pulse.ru' },
    });
    expect(logSpy.mock.calls.flat().join('\n')).toContain(
      '[seed] system user already exists: claude-readonly@allvision-pulse.ru (role: READONLY_ADMIN)',
    );
  });

  it('skips readonly admin when READONLY_ADMIN_PASSWORD is not set', async () => {
    setSystemEnv();

    await runSeed();

    expect(mockState.users.has('claude-readonly@allvision-pulse.ru')).toBe(false);
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('system user skipped');
  });

  it('creates readonly admin on a later run after password is configured', async () => {
    setSystemEnv();
    await runSeed();
    expect(mockState.users.has('claude-readonly@allvision-pulse.ru')).toBe(false);

    process.env.READONLY_ADMIN_PASSWORD = 'readonly-secret';
    await runSeed();

    expect(mockState.users.get('claude-readonly@allvision-pulse.ru')?.role).toBe('READONLY_ADMIN');
    expect(logSpy.mock.calls.flat().join('\n')).toContain(
      '[seed] system user ensured: claude-readonly@allvision-pulse.ru (role: READONLY_ADMIN)',
    );
  });
});
