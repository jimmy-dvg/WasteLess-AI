import "server-only";
import postgres, { type Sql } from "postgres";

type DbRow = Record<string, unknown>;

type DbClient = Sql<DbRow>;

let client: DbClient | null = null;

function getConnectionString(): string {
	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error("Missing DATABASE_URL environment variable.");
	}

	return connectionString;
}

export function getDb(): DbClient {
	if (client) {
		return client;
	}

	client = postgres(getConnectionString(), {
		max: 10,
		idle_timeout: 20,
		connect_timeout: 10,
	});

	return client;
}

export async function closeDbConnection(): Promise<void> {
	if (!client) {
		return;
	}

	await client.end({ timeout: 5 });
	client = null;
}
