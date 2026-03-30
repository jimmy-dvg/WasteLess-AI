import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
	if (browserClient) {
		return browserClient;
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

	if (!url || !publishableKey) {
		throw new Error("Missing Supabase public environment variables.");
	}

	browserClient = createClient<Database>(url, publishableKey);
	return browserClient;
}
