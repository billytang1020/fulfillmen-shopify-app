/**
 * Prisma Client Singleton
 *
 * Ensures a single Prisma client instance is used throughout the application,
 * preventing connection pool exhaustion during development hot reloads.
 */

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // In development, reuse the existing client to avoid connection pool exhaustion
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

export { prisma };
