import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cleanupExpiredSessions } from "@/lib/sessionCleanup";

/**
 * Database-backed session store
 * Works seamlessly on serverless (Vercel) and local environments
 */

/**
 * Generate a random session token
 */
function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: string, email: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Store session in database
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  // Set HTTP-only cookie
  cookies().set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });

  // Opportunistically clean up expired sessions (fire and forget)
  cleanupExpiredSessions().catch(() => {
    // Ignore errors - cleanup is best effort
  });

  return token;
}

/**
 * Get the current session
 */
export async function getSession() {
  const token = cookies().get("admin_session")?.value;

  if (!token) {
    return null;
  }

  // Query session from database
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    // Delete expired session
    await prisma.session.delete({
      where: { id: session.id },
    });
    return null;
  }

  return {
    userId: session.userId,
    email: session.user.email,
    expiresAt: session.expiresAt.getTime(),
  };
}

/**
 * Delete the current session (logout)
 */
export async function deleteSession() {
  const token = cookies().get("admin_session")?.value;

  if (token) {
    // Delete session from database
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  cookies().delete("admin_session");
}

/**
 * Verify login credentials
 */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const session = await getSession();
  return session !== null;
}
