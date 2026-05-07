import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthenticatedUser } from "@/src/lib/jwt-auth";
import { resolveStorageZone } from "@/src/lib/storage-zone";
import { NextResponse } from "next/server";

const ANALYZE_PROMPT =
	"Identify all food items in this image. For each item, provide its name, a category (Vegetables, Dairy, Meat, Pantry, Drinks, Frozen, or Other), estimated shelfLifeDays as a number, and storageZone as one of: fridge, dry_storage, drinks, freezer, other. Return the result strictly as a JSON array.";

const DEFAULT_FREE_TIER_MODELS = [
	"gemini-2.5-flash",
	"gemini-2.0-flash",
	"gemini-2.0-flash-001",
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash-lite-001",
	"gemini-flash-latest",
	"gemini-flash-lite-latest",
];

const DEV_FALLBACK_ITEMS = [
	{ name: "Tomatoes", category: "Vegetables", shelfLifeDays: 5, storageZone: "fridge" },
	{ name: "Milk", category: "Dairy", shelfLifeDays: 3, storageZone: "fridge" },
	{ name: "Rice", category: "Pantry", shelfLifeDays: 180, storageZone: "dry_storage" },
];

function parseJsonArray(raw: string): unknown[] {
	const trimmed = raw.trim();

	const withoutCodeFence = trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();

	try {
		const parsed = JSON.parse(withoutCodeFence);
		if (Array.isArray(parsed)) {
			return parsed;
		}
	} catch {
		// Continue to fallback extraction.
	}

	const match = withoutCodeFence.match(/\[[\s\S]*\]/);
	if (!match) {
		throw new Error("Gemini response did not contain a JSON array.");
	}

	const parsed = JSON.parse(match[0]);
	if (!Array.isArray(parsed)) {
		throw new Error("Parsed Gemini response is not a JSON array.");
	}

	return parsed;
}

function normalizeBase64Image(imageBase64: string): { mimeType: string; data: string } {
	const dataUrlMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/);

	if (dataUrlMatch) {
		return {
			mimeType: dataUrlMatch[1],
			data: dataUrlMatch[2],
		};
	}

	return {
		mimeType: "image/jpeg",
		data: imageBase64,
	};
}

function normalizeAnalyzedItems(
	items: unknown[]
): Array<{ name: string; category: string; shelfLifeDays: number; storageZone: string }> {
	const normalized = items
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const shelfLifeRaw =
				item.shelfLifeDays ??
				item.estimatedShelfLifeDays ??
				item.shelf_life_days ??
				item.shelf_life;
			const category = String(item.category ?? "Other").trim() || "Other";
			const storageZoneRaw =
				item.storageZone ??
				item.storage_zone ??
				item.storage ??
				item.storage_location ??
				item.storageLocation;

			const parsedShelfLife = Number(shelfLifeRaw ?? 0);

			return {
				name: String(item.name ?? item.item ?? "").trim(),
				category,
				shelfLifeDays: Number.isFinite(parsedShelfLife)
					? Math.max(0, Math.round(parsedShelfLife))
					: 0,
				storageZone: resolveStorageZone(storageZoneRaw, category),
			};
		})
		.filter((item) => item.name.length > 0);

	if (normalized.length === 0) {
		throw new Error("Gemini response did not contain valid food items.");
	}

	return normalized;
}

function isGeminiQuotaError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return message.includes("429") || message.includes("quota") || message.includes("too many requests");
}

function isGeminiModelNotFoundError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("not found for api version") ||
		(message.includes("models/") && message.includes("not found"))
	);
}

function isGeminiInvalidImageError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return message.includes("unable to process input image");
}

function extractRetryAfterSeconds(error: unknown): number | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const retryDelayMatch = error.message.match(/retryDelay":"(\d+)s"/);
	if (retryDelayMatch) {
		return Number.parseInt(retryDelayMatch[1], 10);
	}

	const plainMatch = error.message.match(/Please retry in\s+([\d.]+)s/i);
	if (plainMatch) {
		return Math.ceil(Number.parseFloat(plainMatch[1]));
	}

	return null;
}

function getModelCandidates(): string[] {
	const rawModels = process.env.ANALYZE_GEMINI_MODELS || process.env.GEMINI_MODELS;
	if (!rawModels || rawModels.trim().length === 0) {
		return DEFAULT_FREE_TIER_MODELS;
	}

	const parsed = rawModels
		.split(",")
		.map((model) => model.trim())
		.filter((model) => model.length > 0);

	if (parsed.length === 0) {
		return DEFAULT_FREE_TIER_MODELS;
	}

	return Array.from(new Set([...parsed, ...DEFAULT_FREE_TIER_MODELS]));
}

export async function POST(request: Request) {
	try {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Missing GEMINI_API_KEY environment variable." },
				{ status: 500 }
			);
		}


		const user = await getAuthenticatedUser(request);
		if (!user) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Invalid or expired session." },
				{ status: 401 }
			);
		}

		const body = await request.json();
		const imageBase64 = body?.imageBase64;

		if (typeof imageBase64 !== "string" || imageBase64.trim().length === 0) {
			return NextResponse.json(
				{ error: "Request body must include a non-empty imageBase64 string." },
				{ status: 400 }
			);
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const { mimeType, data } = normalizeBase64Image(imageBase64.trim());
		const modelCandidates = getModelCandidates();

		let responseText = "";
		let selectedModel = "";
		let lastError: unknown;
		const attemptErrors: string[] = [];

		for (const modelName of modelCandidates) {
			try {
				const model = genAI.getGenerativeModel({ model: modelName });
				const result = await model.generateContent([
					{ text: ANALYZE_PROMPT },
					{
						inlineData: {
							mimeType,
							data,
						},
					},
				]);

				responseText = result.response.text();
				if (!responseText) {
					throw new Error(`Gemini model ${modelName} returned an empty response.`);
				}

				selectedModel = modelName;

				break;
			} catch (error) {
				lastError = error;
				if (error instanceof Error) {
					attemptErrors.push(`${modelName}: ${error.message}`);
				}
			}
		}

		if (!responseText) {
			if (lastError instanceof Error) {
				const details = attemptErrors.length > 0 ? ` Tried models: ${attemptErrors.join(" | ")}` : "";
				throw new Error(`${lastError.message}${details}`);
			}

			throw new Error("Gemini returned an empty response.");
		}

		const items = normalizeAnalyzedItems(parseJsonArray(responseText));
		return NextResponse.json(items, {
			headers: {
				"x-gemini-model": selectedModel,
			},
		});
	} catch (error) {
		console.error("Analyze API error:", error);

		const allowFallback =
			process.env.ALLOW_QUOTA_FALLBACK === "true" || process.env.NODE_ENV !== "production";

		if (isGeminiQuotaError(error)) {
			if (allowFallback) {
				return NextResponse.json(DEV_FALLBACK_ITEMS, {
					headers: {
						"x-analysis-fallback": "quota",
					},
				});
			}

			const retryAfter = extractRetryAfterSeconds(error);
			const message =
				retryAfter && retryAfter > 0
					? `Gemini quota exceeded. Retry in about ${retryAfter}s or enable billing for your API project.`
					: "Gemini quota exceeded. Enable billing or wait for quota reset.";

			return NextResponse.json(
				{ error: "Failed to analyze image.", details: message },
				{ status: 429 }
			);
		}

		if (allowFallback && isGeminiInvalidImageError(error)) {
			return NextResponse.json(DEV_FALLBACK_ITEMS, {
				headers: {
					"x-analysis-fallback": "image",
				},
			});
		}

		if (isGeminiModelNotFoundError(error)) {
			return NextResponse.json(
				{ error: "Failed to analyze image.", details: "Configured Gemini model was not found." },
				{ status: 500 }
			);
		}

		const details = error instanceof Error ? error.message : "Unknown error.";

		return NextResponse.json(
			{ error: "Failed to analyze image.", details },
			{ status: 500 }
		);
	}
}
