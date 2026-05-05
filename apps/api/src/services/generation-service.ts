import type { Generation, GenerationKind, PrismaClient } from '@allvision/database';

export class GenerationService {
  constructor(private prisma: PrismaClient) {}

  async createGeneration(params: {
    userId: string;
    kind: GenerationKind;
    mode: string;
    prompt?: string;
    inputImages?: string[];
    inputVideo?: string;
    inputAudio?: string;
    avatarIds?: string[];
    sceneId?: string;
    voiceId?: string;
    durationSeconds?: number;
    aspectRatio?: string;
    style?: string;
    aiConfig?: Record<string, unknown>;
    threadId?: string;
    parentGenerationId?: string;
    coinsCost: number;
  }): Promise<Generation> {
    void this.prisma;
    void params;
    throw new Error('NOT_IMPLEMENTED — R6+');
  }

  async getGeneration(userId: string, id: string): Promise<Generation | null> {
    void this.prisma;
    void userId;
    void id;
    throw new Error('NOT_IMPLEMENTED — R6+');
  }

  async listGenerations(
    userId: string,
    filter: {
      kind?: GenerationKind;
      threadId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
    void this.prisma;
    void userId;
    void filter;
    throw new Error('NOT_IMPLEMENTED — R6+');
  }

  async deleteGeneration(userId: string, id: string): Promise<void> {
    void this.prisma;
    void userId;
    void id;
    throw new Error('NOT_IMPLEMENTED — R6+');
  }

  async regenerate(userId: string, generationId: string): Promise<Generation> {
    void this.prisma;
    void userId;
    void generationId;
    throw new Error('NOT_IMPLEMENTED — R6+');
  }
}
