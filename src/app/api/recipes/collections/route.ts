import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/src/types/supabase";

type SupabaseLikeError = {
	code?: string;
	message?: string;
	details?: string;
	hint?: string;
};

type FavoriteRow = {
	title?: unknown;
	description?: unknown;
	instructions?: unknown;
	image_url?: unknown;
	created_at?: unknown;
};

type NoteRow = {
	recipe_title?: unknown;
	note?: unknown;
};

type ShoppingRow = {
	recipe_title?: unknown;
	name?: unknown;
	amount?: unknown;
	unit?: unknown;
};

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

function getSupabaseUserClient(token: string) {
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

function isMissingTableError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const code = String((error as SupabaseLikeError).code ?? "");
	const message = String((error as SupabaseLikeError).message ?? "").toLowerCase();

	return code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

function toErrorMessage(error: unknown): string {
	if (typeof error === "object" && error !== null) {
		const message = String((error as SupabaseLikeError).message ?? "").trim();
		const details = String((error as SupabaseLikeError).details ?? "").trim();
		const hint = String((error as SupabaseLikeError).hint ?? "").trim();
		const combined = [message, details, hint].filter((part) => part.length > 0).join(" ").trim();
		if (combined.length > 0) {
			return combined;
		}
	}

	if (error instanceof Error && error.message) {
		return error.message;
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
		const token = getBearerToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Authentication is required." },
				{ status: 401 }
			);
		}

		const supabase = getSupabaseUserClient(token);
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Invalid or expired session." },
				{ status: 401 }
			);
		}

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

		const favoritesResult = await supabase
			.from("favorite_recipes")
			.select("title, description, instructions, image_url, created_at")
			.order("created_at", { ascending: false });

		if (favoritesResult.error) {
			if (isMissingTableError(favoritesResult.error)) {
				appendWarning(warnings, "Favorites table is missing. Using local mode.");
			} else {
				appendWarning(warnings, `Favorites cloud disabled: ${toErrorMessage(favoritesResult.error)}`);
			}
		} else {
			response.capabilities.favorites = true;
			response.favorites = (favoritesResult.data ?? [])
				.map((item) => {
					const row = item as FavoriteRow;
					return {
						title: String(row.title ?? "").trim(),
						description: String(row.description ?? "").trim(),
						instructions: String(row.instructions ?? "").trim(),
						imageUrl: row.image_url ? String(row.image_url) : null,
						createdAt: String(row.created_at ?? ""),
					};
				})
				.filter((item) => item.title.length > 0);
		}

		const notesResult = await supabase
			.from("recipe_notes")
			.select("recipe_title, note")
			.order("updated_at", { ascending: false });

		if (notesResult.error) {
			if (isMissingTableError(notesResult.error)) {
				appendWarning(warnings, "Notes table is missing. Notes remain local.");
			} else {
				appendWarning(warnings, `Notes cloud disabled: ${toErrorMessage(notesResult.error)}`);
			}
		} else {
			response.capabilities.notes = true;
			response.notes = Object.fromEntries(
				(notesResult.data ?? []).map((item) => {
					const row = item as NoteRow;
					return [String(row.recipe_title ?? ""), String(row.note ?? "")];
				})
			);
		}

		const shoppingResult = await supabase
			.from("shopping_list_items")
			.select("recipe_title, name, amount, unit")
			.order("created_at", { ascending: false });

		if (shoppingResult.error) {
			if (isMissingTableError(shoppingResult.error)) {
				appendWarning(warnings, "Shopping table is missing. Shopping list remains local.");
			} else {
				appendWarning(warnings, `Shopping cloud disabled: ${toErrorMessage(shoppingResult.error)}`);
			}
		} else {
			response.capabilities.shopping = true;
			response.shopping = (shoppingResult.data ?? [])
				.map((item) => {
					const row = item as ShoppingRow;
					return {
						recipeTitle: String(row.recipe_title ?? "").trim(),
						name: String(row.name ?? "").trim(),
						amount: Number(row.amount ?? 0),
						unit: String(row.unit ?? "pcs").trim() || "pcs",
					};
				})
				.filter((item) => item.name.length > 0);
		}

		if (warnings.length > 0) {
			response.warning = warnings.join(" ");
		}

		return NextResponse.json(response);
	} catch (error) {
		const details = toErrorMessage(error);
		return NextResponse.json(
			{ error: "Failed to load recipe collections.", details },
			{ status: 500 }
		);
	}
}
