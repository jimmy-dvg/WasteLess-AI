import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

let supabaseClient: SupabaseClient<Database> | null = null;

function getSupabaseConfig() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

	if (!url) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
	}

	if (!publishableKey) {
		throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable.");
	}

	return { url, publishableKey };
}

export function getSupabaseServerClient(): SupabaseClient<Database> {
	if (supabaseClient) {
		return supabaseClient;
	}

	const { url, publishableKey } = getSupabaseConfig();
	supabaseClient = createClient<Database>(url, publishableKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});

	return supabaseClient;
}
