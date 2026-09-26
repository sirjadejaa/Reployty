import { PrismaClient } from '@prisma/client';

// Global declaration for hot-reloading preservation in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const isProd = process.env.NODE_ENV === 'production';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL,
  });

if (!isProd) {
  globalForPrisma.prisma = prisma;
}

/**
 * Lightweight, safe database health check (SELECT 1).
 * Never runs heavy queries or exposes connection strings.
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: err.message || 'Database connection error',
    };
  }
}

/**
 * Gracefully disconnects the Prisma client.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
