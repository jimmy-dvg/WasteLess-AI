import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/src/lib/supabase-server";
import { NextResponse } from "next/server";

type FoodItemInput = {
	name: string;
	quantity: string;
};

type RecipeOutput = {
	title: string;
	description: string;
	steps: string[];
};

const DEFAULT_RECIPE_MODELS = [
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-latest",
	"gemini-1.5-flash-latest",
	"gemini-1.5-flash",
];

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
		// Continue with fallback extraction.
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

function normalizeFoodItems(payload: unknown): FoodItemInput[] {
	const rawItems = Array.isArray(payload)
		? payload
		: typeof payload === "object" && payload !== null && Array.isArray((payload as { items?: unknown }).items)
			? (payload as { items: unknown[] }).items
			: null;

	if (!rawItems) {
		throw new Error("Request body must be an array of items or an object with an items array.");
	}

	const normalized = rawItems
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const name = String(item.name ?? "").trim();
			const quantityRaw = item.quantity;

			const quantity =
				typeof quantityRaw === "number"
					? String(quantityRaw)
					: typeof quantityRaw === "string"
						? quantityRaw.trim()
						: "";

			return {
				name,
				quantity: quantity.length > 0 ? quantity : "unspecified",
			};
		})
		.filter((item) => item.name.length > 0);

	if (normalized.length === 0) {
		throw new Error("At least one valid food item is required.");
	}

	return normalized;
}

function buildPrompt(items: FoodItemInput[]): string {
	const list = items.map((item) => `${item.name} (${item.quantity})`).join(", ");

	return `I have these ingredients: ${list}. Suggest 3 recipes. For each, provide a title, a short description, and a list of steps. Return the response strictly as a JSON array of objects. Use only these ingredients plus common basics like salt, pepper, water, and oil.`;
}

function normalizeRecipes(payload: unknown[]): RecipeOutput[] {
	const recipes = payload
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const title = String(item.title ?? "").trim();
			const description = String(item.description ?? "").trim();
			const rawSteps = item.steps;

			const steps = Array.isArray(rawSteps)
				? rawSteps.map((step) => String(step ?? "").trim()).filter((step) => step.length > 0)
				: typeof rawSteps === "string"
					? rawSteps
						.split(/\n|\r|\.|;/)
						.map((step) => step.trim())
						.filter((step) => step.length > 0)
					: [];

			return { title, description, steps };
		})
		.filter((recipe) => recipe.title.length > 0 && recipe.description.length > 0 && recipe.steps.length > 0)
		.slice(0, 3);

	if (recipes.length === 0) {
		throw new Error("Gemini response JSON did not contain valid recipe objects.");
	}

	return recipes;
}

function getRecipeModelCandidates(): string[] {
	const recipeModels = process.env.RECIPE_GEMINI_MODELS;
	const sharedModels = process.env.GEMINI_MODELS;
	const source = recipeModels && recipeModels.trim().length > 0 ? recipeModels : sharedModels;

	if (!source || source.trim().length === 0) {
		return DEFAULT_RECIPE_MODELS;
	}

	const parsed = source
		.split(",")
		.map((model) => model.trim())
		.filter((model) => model.length > 0);

	if (parsed.length === 0) {
		return DEFAULT_RECIPE_MODELS;
	}

	return Array.from(new Set(parsed));
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

		const token = getBearerToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Authentication is required." },
				{ status: 401 }
			);
		}

		const authClient = getSupabaseServerClient();
		const {
			data: { user },
			error: userError,
		} = await authClient.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Invalid or expired session." },
				{ status: 401 }
			);
		}

		const body: unknown = await request.json();
		const items = normalizeFoodItems(body);
		const prompt = buildPrompt(items);

		const genAI = new GoogleGenerativeAI(apiKey);
		const modelCandidates = getRecipeModelCandidates();

		let responseText = "";
		let selectedModel = "";
		let lastError: unknown;

		for (const modelName of modelCandidates) {
			try {
				const model = genAI.getGenerativeModel({ model: modelName });
				const result = await model.generateContent(prompt);
				responseText = result.response.text();

				if (!responseText || responseText.trim().length === 0) {
					throw new Error(`Gemini model ${modelName} returned an empty response.`);
				}

				selectedModel = modelName;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!responseText) {
			if (lastError instanceof Error) {
				throw new Error(
					`No available Gemini model could generate recipes. Last error: ${lastError.message}`
				);
			}

			throw new Error("No available Gemini model could generate recipes.");
		}


		const parsed = parseJsonArray(responseText);
		const recipes = normalizeRecipes(parsed);

		return NextResponse.json(recipes, {
			headers: {
				"x-gemini-model": selectedModel,
			},
		});
	} catch (error) {
		console.error("Recipes API error:", error);

		const details = error instanceof Error ? error.message : "Unknown error.";
		const status =
			details.includes("Request body") ||
			details.includes("At least one valid food item")
				? 400
				: 500;

		return NextResponse.json(
			{ error: "Failed to generate recipes.", details },
			{ status }
		);
	}
}