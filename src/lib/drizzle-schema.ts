import { bigint, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
	id: uuid("id").primaryKey(),
	role: text("role").notNull().default("user"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pantryItems = pgTable(
	"pantry_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		category: text("category").notNull().default("Other"),
		shelfLifeDays: integer("shelf_life_days").notNull().default(0),
		storageZone: text("storage_zone"),
		userId: uuid("user_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		userIdIdx: index("pantry_items_user_id_idx").on(table.userId),
		createdAtIdx: index("pantry_items_created_at_idx").on(table.createdAt),
	})
);

export const favoriteRecipes = pgTable(
	"favorite_recipes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		instructions: text("instructions").notNull().default(""),
		imageUrl: text("image_url"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		userIdIdx: index("favorite_recipes_user_id_idx").on(table.userId),
		createdAtIdx: index("favorite_recipes_created_at_idx").on(table.createdAt),
		userTitleUnique: uniqueIndex("favorite_recipes_user_title_key").on(table.userId, table.title),
	})
);

export const recipeFavorites = pgTable("recipe_favorites", {
	userId: uuid("user_id").notNull(),
	recipeTitle: text("recipe_title").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeNotes = pgTable("recipe_notes", {
	userId: uuid("user_id").notNull(),
	recipeTitle: text("recipe_title").notNull(),
	note: text("note").notNull().default(""),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shoppingListItems = pgTable(
	"shopping_list_items",
	{
		id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
		userId: uuid("user_id").notNull(),
		recipeTitle: text("recipe_title").notNull(),
		name: text("name").notNull(),
		amount: numeric("amount", { mode: "number" }).notNull().default(0),
		unit: text("unit").notNull().default("pcs"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		userIdIdx: index("shopping_list_items_user_id_idx").on(table.userId),
	})
);