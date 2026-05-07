import { NextResponse } from 'next/server';
import { getDrizzleClient } from '@/src/lib/drizzle-client';
import { profiles } from '@/src/lib/drizzle-schema';
import { generateToken } from '@/src/lib/jwt-auth';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Simple password hashing (use bcrypt in production)
 */
function hashPassword(password: string): string {
	return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify password
 */
function verifyPassword(password: string, hash: string): boolean {
	return hashPassword(password) === hash;
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { action, email, password } = body;

		if (!email || !password) {
			return NextResponse.json(
				{ error: 'Missing email or password' },
				{ status: 400 }
			);
		}

		const db = getDrizzleClient();

		if (action === 'register') {
			// Check if user already exists
			const existing = await db
				.select()
				.from(profiles)
				.where(eq(profiles.email, email))
				.limit(1);

			if (existing.length > 0) {
				return NextResponse.json(
					{ error: 'User already exists' },
					{ status: 400 }
				);
			}

			// Create new user
			const userId = crypto.randomUUID();
			const passwordHash = hashPassword(password);

			await db.insert(profiles).values({
				id: userId,
				email,
				passwordHash,
				role: 'user',
				createdAt: new Date(),
			});

			const token = generateToken(userId, email, 'user');

			return NextResponse.json(
				{
					success: true,
					token,
					user: { id: userId, email, role: 'user' },
				},
				{ status: 201 }
			);
		}

		if (action === 'login') {
			// Find user
			const user = await db
				.select()
				.from(profiles)
				.where(eq(profiles.email, email))
				.limit(1);

			if (user.length === 0 || !user[0].passwordHash) {
				return NextResponse.json(
					{ error: 'Invalid email or password' },
					{ status: 401 }
				);
			}

			// Verify password
			if (!verifyPassword(password, user[0].passwordHash)) {
				return NextResponse.json(
					{ error: 'Invalid email or password' },
					{ status: 401 }
				);
			}

			const token = generateToken(user[0].id, email, user[0].role);

			return NextResponse.json({
				success: true,
				token,
				user: { id: user[0].id, email, role: user[0].role },
			});
		}

		return NextResponse.json(
			{ error: 'Invalid action' },
			{ status: 400 }
		);
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error';
		return NextResponse.json(
			{ error: 'Auth failed', details },
			{ status: 500 }
		);
	}
}
