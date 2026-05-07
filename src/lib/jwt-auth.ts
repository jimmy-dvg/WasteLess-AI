import jwt from 'jsonwebtoken';
import { getDrizzleClient } from '@/src/lib/drizzle-client';
import { profiles } from '@/src/lib/drizzle-schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

export interface TokenPayload {
	userId: string;
	email: string;
	role: string;
}

/**
 * Generate JWT token for user
 */
export function generateToken(userId: string, email: string, role: string = 'user'): string {
	const payload: TokenPayload = { userId, email, role };
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
	try {
		return jwt.verify(token, JWT_SECRET) as TokenPayload;
	} catch (error) {
		return null;
	}
}

/**
 * Extract Bearer token from Authorization header
 */
export function getBearerToken(request: Request): string | null {
	const header = request.headers.get('authorization');
	if (!header) return null;

	const [scheme, token] = header.split(' ');
	if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

	return token;
}

/**
 * Get authenticated user from request
 */
export async function getAuthenticatedUser(request: Request): Promise<{ userId: string; email: string; role: string } | null> {
	const token = getBearerToken(request);
	if (!token) return null;

	const payload = verifyToken(token);
	if (!payload) return null;

	// Verify user still exists in DB
	const db = getDrizzleClient();
	const user = await db
		.select()
		.from(profiles)
		.where(eq(profiles.id, payload.userId))
		.limit(1);

	if (user.length === 0) return null;

	return {
		userId: payload.userId,
		email: payload.email,
		role: payload.role,
	};
}

/**
 * Middleware for API routes - returns error response if not authenticated
 */
export async function withAuth(request: Request, handler: (user: { userId: string; email: string; role: string }) => Promise<Response>) {
	const user = await getAuthenticatedUser(request);
	if (!user) {
		return new Response(JSON.stringify({ error: 'Unauthorized', details: 'Invalid or missing token' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return handler(user);
}
