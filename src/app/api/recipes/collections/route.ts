import { desc, eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDrizzleClient } from "@/src/lib/drizzle-client";
import {
	favoriteRecipes,
	recipeNotes,
	shoppingListItems,
} from "@/src/lib/drizzle-schema";
import { getAuthenticatedUser } from "@/src/lib/jwt-auth";

type CollectionsResponse = {
	favorites: Array<{
		title: string;
		description: string;
		instructions: string;
		imageUrl: string | null;
		createdAt: string;
	}>;
	notes: Record<string, string>;
	shopping: Array<{
		recipeTitle: string;
		name: string;
		amount: number;
		unit: string;
	}>;
	capabilities: {
		favorites: boolean;
		notes: boolean;
		shopping: boolean;
	};
	warning?: string;
};

function getBearerToken(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) {
		return null;
	}

	const [scheme, token] = header.split(" ");
	if (scheme?.toLowerCase() !== "bearer" || !token) {
		return null;
	}

	return token;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
		const msg = String((error as Record<string, unknown>).message ?? "").trim();
		if (msg) return msg;
	}

	return "Unknown database error.";
}

function appendWarning(warnings: string[], nextWarning: string) {
	if (!warnings.includes(nextWarning)) {
		warnings.push(nextWarning);
	}
}

export async function GET(request: Request) {
	try {
		const user = await getAuthenticatedUser(request);
		if (!user) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Invalid or expired session." },
				{ status: 401 }
			);
		}

		const db = getDrizzleClient();
		const response: CollectionsResponse = {
			favorites: [],
			notes: {},
			shopping: [],
			capabilities: {
				favorites: false,
				notes: false,
				shopping: false,
			},
		};

		const warnings: string[] = [];

		try {
			const favItems = await db
				.select()
				.from(favoriteRecipes)
				.where(eq(favoriteRecipes.userId, user.userId))
				.orderBy(desc(favoriteRecipes.createdAt))
				.limit(50);

			response.capabilities.favorites = true;
			response.favorites = favItems.map((item) => ({
				title: item.title.trim(),
				description: item.description.trim(),
				instructions: item.instructions.trim(),
				imageUrl: item.imageUrl ?? null,
				createdAt: item.createdAt.toISOString(),
			}));
		} catch (error) {
			appendWarning(warnings, `Favorites disabled: ${toErrorMessage(error)}`);
		}

		try {
			const noteItems = await db
				.select()
				.from(recipeNotes)
				.where(eq(recipeNotes.userId, user.userId))
				.orderBy(desc(recipeNotes.updatedAt))
				.limit(500);

			response.capabilities.notes = true;
			response.notes = Object.fromEntries(
				noteItems.map((item) => [item.recipeTitle, item.note])
			);
		} catch (error) {
			appendWarning(warnings, `Notes disabled: ${toErrorMessage(error)}`);
		}

		try {
			const shoppingItems = await db
				.select()
				.from(shoppingListItems)
				.where(eq(shoppingListItems.userId, user.userId))
				.orderBy(desc(shoppingListItems.createdAt))
				.limit(500);

			response.capabilities.shopping = true;
			response.shopping = shoppingItems.map((item) => ({
				recipeTitle: item.recipeTitle.trim(),
				name: item.name.trim(),
				amount: Number(item.amount),
				unit: item.unit.trim() || "pcs",
			}));
		} catch (error) {
			appendWarning(warnings, `Shopping disabled: ${toErrorMessage(error)}`);
		}

		if (warnings.length > 0) {
			response.warning = warnings.join(" ");
		}

		return NextResponse.json(response);
	} catch (error) {
		const details = error instanceof Error ? error.message : "Unknown error.";
		return NextResponse.json(
			{ error: "Failed to load recipe collections.", details },
			{ status: 500 }
		);
	}
}

export async function POST(request: Request) {
	try {
		const user = await getAuthenticatedUser(request);
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized', details: 'Invalid or expired session.' }, { status: 401 });
		}

		const payload = await request.json().catch(() => ({} as any));
		const action = String(payload.action ?? '').trim();
		const db = getDrizzleClient();

		if (action === 'syncFavorites') {
			const rows = Array.isArray(payload.rows) ? payload.rows : [];
			// Replace favorites for the user
			await db.delete(favoriteRecipes).where(eq(favoriteRecipes.userId, user.userId));

			if (rows.length === 0) {
				return NextResponse.json({ inserted: 0 });
			}

			const inserts = rows.map((r: any) => ({
				userId: user.userId,
				title: String(r.title ?? '').trim(),
				description: String(r.description ?? '').trim(),
				instructions: String(r.instructions ?? '').trim(),
				imageUrl: r.imageUrl ?? null,
			}));

			await db.insert(favoriteRecipes).values(inserts);
			return NextResponse.json({ inserted: inserts.length });
		}

		if (action === 'syncShopping') {
			const rows = Array.isArray(payload.rows) ? payload.rows : [];
			await db.delete(shoppingListItems).where(eq(shoppingListItems.userId, user.userId));

			if (rows.length === 0) {
				return NextResponse.json({ inserted: 0 });
			}

			const inserts = rows.map((r: any) => ({
				userId: user.userId,
				recipeTitle: String(r.recipeTitle ?? '').trim(),
				name: String(r.name ?? '').trim(),
				amount: Number(r.amount ?? 0),
				unit: String(r.unit ?? 'pcs').trim() || 'pcs',
			}));

			await db.insert(shoppingListItems).values(inserts);
			return NextResponse.json({ inserted: inserts.length });
		}

		if (action === 'upsertNote') {
			const noteEntry = payload.note ?? null;
			if (!noteEntry || typeof noteEntry !== 'object') {
				return NextResponse.json({ error: 'BadRequest', details: 'Missing note payload' }, { status: 400 });
			}

			const recipeTitle = String(noteEntry.recipeTitle ?? '').trim();
			const note = String(noteEntry.note ?? '').trim();

			if (!recipeTitle) {
				return NextResponse.json({ error: 'BadRequest', details: 'Missing recipeTitle' }, { status: 400 });
			}

			// Delete existing first
			await db.delete(recipeNotes).where(
				and(eq(recipeNotes.userId, user.userId), eq(recipeNotes.recipeTitle, recipeTitle))
			);

			// If note is empty, do not insert — this represents deletion
			if (note.length === 0) {
				return NextResponse.json({ upserted: 0, deleted: 1 });
			}

			await db.insert(recipeNotes).values({ userId: user.userId, recipeTitle, note, updatedAt: new Date() });
			return NextResponse.json({ upserted: 1 });
		}

		return NextResponse.json({ error: 'BadRequest', details: 'Unknown action' }, { status: 400 });
	} catch (error) {
		const details = error instanceof Error ? error.message : 'Unknown error.';
		return NextResponse.json({ error: 'Failed to execute action', details }, { status: 500 });
	}
}
