import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";

import { getDb } from "@/src/lib/db";
import * as schema from "@/src/lib/drizzle-schema";

export function getDrizzleClient() {
	return drizzle(getDb(), { schema });
}