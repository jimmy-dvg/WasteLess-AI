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

export async function GET() {
	try {
		const supabase = getSupabaseServerClient();
		const { data, error } = await supabase
			.from("pantry_items")
			.select("id, name, category, shelf_life_days, created_at")
			.order("created_at", { ascending: false })
			.limit(50);

		if (error) {
			throw error;
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
		const payload: unknown = await request.json();
		const items = normalizePayload(payload);
		const supabase = getSupabaseServerClient();

		const insertRows: PantryInsert[] = items.map((item) => ({
			name: item.name,
			category: item.category,
			shelf_life_days: item.shelfLifeDays,
		}));

		const { data, error } = await supabase
			.from("pantry_items")
			.insert(insertRows)
			.select("id, name, category, shelf_life_days, created_at");

		if (error) {
			throw error;
		}

		return NextResponse.json({ inserted: data?.length ?? 0, items: data ?? [] }, { status: 201 });
	} catch (error) {
		const details = error instanceof Error ? error.message : "Unknown database error.";
		return NextResponse.json(
			{ error: "Failed to save pantry items.", details },
			{ status: 500 }
		);
	}
}
