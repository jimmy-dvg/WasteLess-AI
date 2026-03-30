import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export type UserRole = "user" | "admin";

export async function getUserRole(userId: string): Promise<UserRole | null> {
	if (!userId) {
		return null;
	}

	const supabase = getSupabaseBrowserClient();
	const { data, error } = await supabase
		.from("profiles")
		.select("role")
		.eq("id", userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	if (!data || typeof data.role !== "string") {
		return null;
	}

	return data.role === "admin" ? "admin" : "user";
}
