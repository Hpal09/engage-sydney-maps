import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Simple in-memory session store for MVP
 * WARNING: This is for development only!
 * In production, use a proper session store (Redis, database, etc.)
 */
const sessions = new Map<string, { userId: string; email: string; expiresAt: number }>();

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

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
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  sessions.set(token, { userId, email, expiresAt });

  // Set HTTP-only cookie
  cookies().set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
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

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Delete the current session (logout)
 */
export async function deleteSession() {
  const token = cookies().get("admin_session")?.value;

  if (token) {
    sessions.delete(token);
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
