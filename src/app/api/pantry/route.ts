import { desc, eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDrizzleClient } from "@/src/lib/drizzle-client";
import { pantryItems } from "@/src/lib/drizzle-schema";
import { getAuthenticatedUser } from "@/src/lib/jwt-auth";
import { resolveStorageZone } from "@/src/lib/storage-zone";

type PantryItemPayload = {
	name: string;
	category: string;
	shelfLifeDays: number;
	storageZone: string;
};

type PantryRowSelection = {
	id: string;
	name: string;
	category: string;
	shelfLifeDays: number;
	storageZone: string | null;
	createdAt: Date | string | null;
	userId: string | null;
};

function redirectToLogin(request: Request): NextResponse {
	return NextResponse.json(
		{ error: "Unauthorized", details: "Authentication is required." },
		{ status: 401 }
	);
}

async function getAuthenticatedContext(
	request: Request
): Promise<{ userId: string } | NextResponse> {
	const user = await getAuthenticatedUser(request);
	if (!user) {
		return redirectToLogin(request);
	}

	return { userId: user.userId };
}

function toErrorMessage(error: unknown, fallback = "Unknown database error."): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
		const message = "message" in error ? String((error as { message?: string }).message ?? "").trim() : "";
		const details = "details" in error ? String((error as { details?: string }).details ?? "").trim() : "";
		const hint = "hint" in error ? String((error as { hint?: string }).hint ?? "").trim() : "";
		const combined = [message, details, hint].filter((part) => part.length > 0).join(" ").trim();
		if (combined) {
			return combined;
		}
	}

	return fallback;
}

function mapPantryRows(rows: PantryRowSelection[]) {
	return rows
		.map((item) => {
			const category = String(item.category ?? "Other").trim() || "Other";
			const shelfLifeDays = Number(item.shelfLifeDays ?? 0);

			return {
				id: String(item.id ?? ""),
				name: String(item.name ?? "Unnamed item"),
				category,
				shelfLifeDays: Number.isFinite(shelfLifeDays) ? Math.max(0, Math.round(shelfLifeDays)) : 0,
				storageZone: resolveStorageZone(item.storageZone, category),
				createdAt: item.createdAt ? String(item.createdAt) : null,
			};
		})
		.filter((item) => item.id.length > 0);
}

function normalizePayload(payload: unknown): PantryItemPayload[] {
	if (!Array.isArray(payload)) {
		throw new Error("Request body must be an array of items.");
	}

	const normalized = payload
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const category = String(item.category ?? "Other").trim() || "Other";
			const rawStorageZone = item.storageZone ?? item.storage_zone;

			return {
				name: String(item.name ?? "").trim(),
				category,
				shelfLifeDays: Number(item.shelfLifeDays ?? 0),
				storageZone: resolveStorageZone(rawStorageZone, category),
			};
		})
		.filter((item) => item.name.length > 0)
		.map((item) => ({
			...item,
			shelfLifeDays: Number.isFinite(item.shelfLifeDays)
				? Math.max(0, Math.round(item.shelfLifeDays))
				: 0,
		}));

	if (normalized.length === 0) {
		throw new Error("No valid items were provided.");
	}

	return normalized;
}

export async function GET(request: Request) {
	try {
		const context = await getAuthenticatedContext(request);
		if (context instanceof NextResponse) {
			return context;
		}

		const db = getDrizzleClient();
		const rows = await db
			.select()
			.from(pantryItems)
			.where(eq(pantryItems.userId, context.userId))
			.orderBy(desc(pantryItems.createdAt))
			.limit(50);

		return NextResponse.json(mapPantryRows(rows));
	} catch (error) {
		const details = error instanceof Error ? error.message : "Unknown database error.";
		return NextResponse.json(
			{ error: "Failed to load pantry items.", details },
			{ status: 500 }
		);
	}
}

export async function POST(request: Request) {
	try {
		const context = await getAuthenticatedContext(request);
		if (context instanceof NextResponse) {
			return context;
		}

		const payload: unknown = await request.json();
		const items = normalizePayload(payload);
		const db = getDrizzleClient();
		const insertedRows = await db
			.insert(pantryItems)
			.values(
				items.map((item) => ({
					name: item.name,
					category: item.category,
					shelfLifeDays: item.shelfLifeDays,
					storageZone: item.storageZone,
					userId: context.userId,
				}))
			)
			.returning();

		const insertedItems = mapPantryRows(insertedRows);

		return NextResponse.json(
			{ inserted: insertedItems.length, items: insertedItems, compatibilityMode: false },
			{ status: 201 }
		);
	} catch (error) {
		const details = toErrorMessage(error);
		return NextResponse.json(
			{ error: "Failed to save pantry items.", details },
			{ status: 500 }
		);
	}
}

export async function DELETE(request: Request) {
	try {
		const context = await getAuthenticatedContext(request);
		if (context instanceof NextResponse) return context;

		const payload = await request.json().catch(() => ({} as any));
		const ids = Array.isArray(payload?.ids) ? (payload.ids as Array<unknown>).map(String).filter((v: string) => v.length > 0) : [];
		if (ids.length === 0) {
			return NextResponse.json({ error: 'BadRequest', details: 'No ids provided.' }, { status: 400 });
		}

		const db = getDrizzleClient();
		// delete each id belonging to the user
		await Promise.all(
			ids.map((id: string) => db.delete(pantryItems).where(and(eq(pantryItems.userId, context.userId), eq(pantryItems.id, id))))
		);

		return NextResponse.json({ deleted: ids.length });
	} catch (error) {
		const details = toErrorMessage(error);
		return NextResponse.json({ error: 'Failed to delete pantry items.', details }, { status: 500 });
	}
}

export async function PATCH(request: Request) {
	try {
		const context = await getAuthenticatedContext(request);
		if (context instanceof NextResponse) return context;

		const payload = await request.json().catch(() => ({} as any));
		const updates = Array.isArray(payload?.updates) ? payload.updates : (payload && payload.id ? [payload] : []);
		if (!Array.isArray(updates) || updates.length === 0) {
			return NextResponse.json({ error: 'BadRequest', details: 'No updates provided.' }, { status: 400 });
		}

		const db = getDrizzleClient();
		let updatedCount = 0;
		for (const u of updates) {
			const id = String(u?.id ?? "").trim();
			if (!id) continue;

			const setObj: Record<string, unknown> = {};
			if (u && typeof u === "object") {
				if ("name" in u) setObj.name = String(u.name ?? "").trim();
				if ("category" in u) setObj.category = String(u.category ?? "Other").trim() || "Other";
				if ("shelfLifeDays" in u) {
					const v = Number(u.shelfLifeDays ?? 0);
					setObj.shelfLifeDays = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
				}
				if ("storageZone" in u || "storage_zone" in u) {
					const raw = u.storageZone ?? u.storage_zone;
					setObj.storageZone = resolveStorageZone(raw, String(setObj.category ?? "Other"));
				}
			}

			if (Object.keys(setObj).length === 0) continue;

			await db.update(pantryItems).set(setObj).where(and(eq(pantryItems.userId, context.userId), eq(pantryItems.id, id)));
			updatedCount++;
		}

		return NextResponse.json({ updated: updatedCount });
	} catch (error) {
		const details = toErrorMessage(error);
		return NextResponse.json({ error: 'Failed to update pantry items.', details }, { status: 500 });
	}
}
