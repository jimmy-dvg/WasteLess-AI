import { getSupabaseServerClient } from "@/src/lib/supabase-server";
import type { Tables, TablesInsert } from "@/src/types/supabase";
import { NextResponse } from "next/server";

type PantryItemPayload = {
	name: string;
	category: string;
	shelfLifeDays: number;
};

type PantryRow = Tables<"pantry_items">;
type PantryInsert = TablesInsert<"pantry_items">;
type PantryInsertWithUser = PantryInsert & { user_id: string };

type SupabaseLikeError = {
	message?: string;
	details?: string;
	hint?: string;
	code?: string;
};

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

function normalizePayload(payload: unknown): PantryItemPayload[] {
	if (!Array.isArray(payload)) {
		throw new Error("Request body must be an array of items.");
	}

	const normalized = payload
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => ({
			name: String(item.name ?? "").trim(),
			category: String(item.category ?? "Other").trim() || "Other",
			shelfLifeDays: Number(item.shelfLifeDays ?? 0),
		}))
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
		const supabase = getSupabaseServerClient();
		const token = getBearerToken(request);
		if (!token) {
			return redirectToLogin(request);
		}

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return redirectToLogin(request);
		}

		const { data, error } = await supabase
			.from("pantry_items")
			.select("id, name, category, shelf_life_days, created_at")
			.eq("user_id", user.id)
			.order("created_at", { ascending: false })
			.limit(50);

		if (error && !isMissingUserIdColumnError(error)) {
			throw error;
		}

		if (error && isMissingUserIdColumnError(error)) {
			const fallback = await supabase
				.from("pantry_items")
				.select("id, name, category, shelf_life_days, created_at")
				.order("created_at", { ascending: false })
				.limit(50);

			if (fallback.error) {
				throw fallback.error;
			}

			const fallbackRows: PantryRow[] = fallback.data ?? [];
			const fallbackItems = fallbackRows.map((item) => ({
				id: item.id,
				name: item.name,
				category: item.category,
				shelfLifeDays: item.shelf_life_days,
				createdAt: item.created_at,
			}));

			return NextResponse.json(fallbackItems);
		}

		const rows: PantryRow[] = data ?? [];

		const items = rows.map((item) => ({
			id: item.id,
			name: item.name,
			category: item.category,
			shelfLifeDays: item.shelf_life_days,
			createdAt: item.created_at,
		}));

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
		const supabase = getSupabaseServerClient();
		const token = getBearerToken(request);
		if (!token) {
			return redirectToLogin(request);
		}

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return redirectToLogin(request);
		}

		const payload: unknown = await request.json();
		const items = normalizePayload(payload);

		const insertRows: PantryInsertWithUser[] = items.map((item) => ({
			name: item.name,
			category: item.category,
			shelf_life_days: item.shelfLifeDays,
			user_id: user.id,
		}));

		const { data, error } = await supabase
			.from("pantry_items")
			.insert(insertRows)
			.select("id, name, category, shelf_life_days, created_at");

		if (error && !isMissingUserIdColumnError(error)) {
			throw error;
		}

		if (error && isMissingUserIdColumnError(error)) {
			const fallbackInsertRows: PantryInsert[] = items.map((item) => ({
				name: item.name,
				category: item.category,
				shelf_life_days: item.shelfLifeDays,
			}));

			const fallback = await supabase
				.from("pantry_items")
				.insert(fallbackInsertRows)
				.select("id, name, category, shelf_life_days, created_at");

			if (fallback.error) {
				throw fallback.error;
			}

			return NextResponse.json(
				{ inserted: fallback.data?.length ?? 0, items: fallback.data ?? [], compatibilityMode: true },
				{ status: 201 }
			);
		}

		return NextResponse.json({ inserted: data?.length ?? 0, items: data ?? [] }, { status: 201 });
	} catch (error) {
		const details = toErrorMessage(error);
		return NextResponse.json(
			{ error: "Failed to save pantry items.", details },
			{ status: 500 }
		);
	}
}
