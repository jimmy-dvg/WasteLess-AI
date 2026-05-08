import type { Config } from "drizzle-kit";
import { config as dotenvConfig } from "dotenv";

// Load environment variables from .env.local
dotenvConfig({ path: ".env.local" });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	throw new Error("DATABASE_URL is not defined. Check .env.local");
}

const config: Config = {
	schema: "./src/lib/drizzle-schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: dbUrl,
	},
};

export default config;