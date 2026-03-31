import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveStorageZone } from "@/src/lib/storage-zone";
import type { Database, Tables, TablesInsert } from "@/src/types/supabase";
import { NextResponse } from "next/server";

type PantryItemPayload = {
	name: string;
	category: string;
	shelfLifeDays: number;
	storageZone: string;
};

type PantryRow = Tables<"pantry_items">;
type PantryInsert = TablesInsert<"pantry_items">;
type UserSupabaseClient = SupabaseClient<Database>;

type PantryRowSelection = {
	id: PantryRow["id"];
	name: PantryRow["name"];
	category: PantryRow["category"];
	shelf_life_days: PantryRow["shelf_life_days"];
	created_at: PantryRow["created_at"];
	storage_zone?: PantryRow["storage_zone"];
};

type SupabaseLikeError = {
	message?: string;
	details?: string;
	hint?: string;
	code?: string;
};

const SELECT_COLUMNS_WITH_STORAGE_ZONE =
	"id, name, category, shelf_life_days, storage_zone, created_at, user_id";
const SELECT_COLUMNS_WITHOUT_STORAGE_ZONE = "id, name, category, shelf_life_days, created_at, user_id";

function redirectToLogin(request: Request): NextResponse {
	return NextResponse.redirect(new URL("/login", request.url));
}

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

function getSupabaseUserClient(token: string): UserSupabaseClient {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

	if (!url) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
	}

	if (!publishableKey) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable.");
	}

	return createClient<Database>(url, publishableKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
		global: {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	});
}

async function getAuthenticatedContext(
	request: Request
): Promise<{ supabase: UserSupabaseClient; userId: string } | NextResponse> {
	const token = getBearerToken(request);
	if (!token) {
		return redirectToLogin(request);
	}

	const supabase = getSupabaseUserClient(token);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return redirectToLogin(request);
	}

	return { supabase, userId: user.id };
}

function toErrorMessage(error: unknown, fallback = "Unknown database error."): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
		const message = String((error as SupabaseLikeError).message ?? "").trim();
		const details = String((error as SupabaseLikeError).details ?? "").trim();
		const hint = String((error as SupabaseLikeError).hint ?? "").trim();
		const combined = [message, details, hint].filter((part) => part.length > 0).join(" ").trim();
		if (combined) {
			return combined;
		}
	}

	return fallback;
}

function isMissingUserIdColumnError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const code = String((error as SupabaseLikeError).code ?? "");
	const message = String((error as SupabaseLikeError).message ?? "");

	return (
		code === "42703" ||
		message.includes("column pantry_items.user_id does not exist") ||
		message.includes("column \"user_id\" does not exist") ||
		message.includes("Could not find the 'user_id' column of 'pantry_items' in the schema cache")
	);
}

function isMissingStorageZoneColumnError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const code = String((error as SupabaseLikeError).code ?? "");
	const message = String((error as SupabaseLikeError).message ?? "");

	return (
		code === "42703" ||
		message.includes("column pantry_items.storage_zone does not exist") ||
		message.includes("column \"storage_zone\" does not exist") ||
		message.includes("Could not find the 'storage_zone' column of 'pantry_items' in the schema cache")
	);
}

function mapPantryRows(rows: PantryRowSelection[]) {
	return rows
		.map((item) => {
			const category = String(item.category ?? "Other").trim() || "Other";
			const shelfLifeDays = Number(item.shelf_life_days ?? 0);

			return {
				id: String(item.id ?? ""),
				name: String(item.name ?? "Unnamed item"),
				category,
				shelfLifeDays: Number.isFinite(shelfLifeDays) ? Math.max(0, Math.round(shelfLifeDays)) : 0,
				storageZone: resolveStorageZone(item.storage_zone, category),
				createdAt: item.created_at ? String(item.created_at) : null,
			};
		})
		.filter((item) => item.id.length > 0);
}

async function fetchPantryRows(
	supabase: UserSupabaseClient,
	userId: string
): Promise<{ rows: PantryRowSelection[]; compatibilityMode: boolean }> {
	let includeStorageZone = true;
	let scopeByUser = true;
	let compatibilityMode = false;

	for (let attempt = 0; attempt < 4; attempt += 1) {
		const selectColumns = includeStorageZone
			? SELECT_COLUMNS_WITH_STORAGE_ZONE
			: SELECT_COLUMNS_WITHOUT_STORAGE_ZONE;

		let query = supabase
			.from("pantry_items")
			.select(selectColumns)
			.order("created_at", { ascending: false })
			.limit(50);

		if (scopeByUser) {
			query = query.eq("user_id", userId);
		}

		const { data, error } = await query;

		if (!error) {
			return {
				rows: ((data ?? []) as unknown) as PantryRowSelection[],
				compatibilityMode,
			};
		}

		if (includeStorageZone && isMissingStorageZoneColumnError(error)) {
			includeStorageZone = false;
			compatibilityMode = true;
			continue;
		}

		if (scopeByUser && isMissingUserIdColumnError(error)) {
			scopeByUser = false;
			compatibilityMode = true;
			continue;
		}

		throw error;
	}

	throw new Error("Failed to load pantry items due to incompatible schema.");
}

async function insertPantryRows(
	supabase: UserSupabaseClient,
	userId: string,
	items: PantryItemPayload[]
): Promise<{ rows: PantryRowSelection[]; compatibilityMode: boolean }> {
	let includeStorageZone = true;
	let includeUserId = true;
	let compatibilityMode = false;

	for (let attempt = 0; attempt < 4; attempt += 1) {
		const insertRows: PantryInsert[] = items.map((item) => {
			const row: PantryInsert = {
				name: item.name,
				category: item.category,
				shelf_life_days: item.shelfLifeDays,
			};

			if (includeStorageZone) {
				row.storage_zone = item.storageZone;
			}

			if (includeUserId) {
				row.user_id = userId;
			}

			return row;
		});

		const selectColumns = includeStorageZone
			? SELECT_COLUMNS_WITH_STORAGE_ZONE
			: SELECT_COLUMNS_WITHOUT_STORAGE_ZONE;

		const { data, error } = await supabase
			.from("pantry_items")
			.insert(insertRows)
			.select(selectColumns);

		if (!error) {
			return {
				rows: ((data ?? []) as unknown) as PantryRowSelection[],
				compatibilityMode,
			};
		}

		if (includeStorageZone && isMissingStorageZoneColumnError(error)) {
			includeStorageZone = false;
			compatibilityMode = true;
			continue;
		}

		if (includeUserId && isMissingUserIdColumnError(error)) {
			includeUserId = false;
			compatibilityMode = true;
			continue;
		}

		throw error;
	}

	throw new Error("Failed to save pantry items due to incompatible schema.");
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

		const { supabase, userId } = context;
		const { rows } = await fetchPantryRows(supabase, userId);
		const items = mapPantryRows(rows);

		return NextResponse.json(items);
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

		const { supabase, userId } = context;

		const payload: unknown = await request.json();
		const items = normalizePayload(payload);
		const { rows, compatibilityMode } = await insertPantryRows(supabase, userId, items);
		const insertedItems = mapPantryRows(rows);

		return NextResponse.json(
			{ inserted: insertedItems.length, items: insertedItems, compatibilityMode },
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
