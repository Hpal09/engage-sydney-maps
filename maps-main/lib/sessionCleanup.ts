import { prisma } from "@/lib/prisma";

/**
 * Clean up expired sessions from the database
 * This function can be called periodically via:
 * - Vercel Cron Jobs
 * - Opportunistically during login/logout
 * - Manual admin endpoint
 */
export async function cleanupExpiredSessions() {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    console.log(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  } catch (error) {
    console.error("Error cleaning up expired sessions:", error);
    return 0;
  }
}
