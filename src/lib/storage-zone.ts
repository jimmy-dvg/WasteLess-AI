export const STORAGE_ZONES = ["fridge", "dry_storage", "drinks", "freezer", "other"] as const;

export type StorageZone = (typeof STORAGE_ZONES)[number];

const FRIDGE_KEYWORDS = [
	"dairy",
	"milk",
	"yogurt",
	"cheese",
	"meat",
	"fish",
	"seafood",
	"egg",
	"vegetable",
	"veggie",
	"fruit",
	"produce",
	"greens",
	"fresh",
	"leftover",
	"sauce",
	"chilled",
	"refrigerated",
];

const DRY_STORAGE_KEYWORDS = [
	"pantry",
	"dry",
	"grain",
	"rice",
	"pasta",
	"cereal",
	"spice",
	"flour",
	"sugar",
	"beans",
	"lentils",
	"snack",
	"bread",
	"canned",
	"jar",
];

const DRINKS_KEYWORDS = [
	"drink",
	"beverage",
	"juice",
	"soda",
	"water",
	"tea",
	"coffee",
	"milkshake",
	"smoothie",
	"wine",
	"beer",
	"cocktail",
];

const FREEZER_KEYWORDS = ["freezer", "frozen", "ice cream", "ice-cream"];

function normalizeText(value: string): string {
	return value.trim().toLowerCase();
}

function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
	return keywords.some((keyword) => text.includes(keyword));
}

export function normalizeStorageZone(value: unknown): StorageZone {
	if (typeof value !== "string") {
		return "other";
	}

	const normalized = normalizeText(value);

	if (normalized === "fridge" || normalized === "refrigerator" || normalized === "cold") {
		return "fridge";
	}

	if (
		normalized === "dry_storage" ||
		normalized === "dry" ||
		normalized === "pantry" ||
		normalized === "shelf"
	) {
		return "dry_storage";
	}

	if (normalized === "drinks" || normalized === "drink" || normalized === "beverages") {
		return "drinks";
	}

	if (normalized === "freezer" || normalized === "frozen") {
		return "freezer";
	}

	return "other";
}

export function inferStorageZoneFromCategory(category: string): StorageZone {
	const normalizedCategory = normalizeText(category);

	if (!normalizedCategory) {
		return "other";
	}

	if (includesAnyKeyword(normalizedCategory, DRINKS_KEYWORDS)) {
		return "drinks";
	}

	if (includesAnyKeyword(normalizedCategory, FREEZER_KEYWORDS)) {
		return "freezer";
	}

	if (includesAnyKeyword(normalizedCategory, FRIDGE_KEYWORDS)) {
		return "fridge";
	}

	if (includesAnyKeyword(normalizedCategory, DRY_STORAGE_KEYWORDS)) {
		return "dry_storage";
	}

	return "other";
}

export function resolveStorageZone(rawStorageZone: unknown, category: string): StorageZone {
	const inferredStorageZone = inferStorageZoneFromCategory(category);
	const normalizedStorageZone = normalizeStorageZone(rawStorageZone);

	if (typeof rawStorageZone !== "string" || rawStorageZone.trim().length === 0) {
		return inferredStorageZone;
	}

	if (normalizedStorageZone === "other" && inferredStorageZone !== "other") {
		return inferredStorageZone;
	}

	return normalizedStorageZone;
}

export function getStorageZoneLabel(storageZone: StorageZone): string {
	switch (storageZone) {
		case "fridge":
			return "Fridge";
		case "dry_storage":
			return "Dry Storage";
		case "drinks":
			return "Drinks";
		case "freezer":
			return "Freezer";
		default:
			return "Other";
	}
}