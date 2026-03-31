import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/src/lib/supabase-server";
import { NextResponse } from "next/server";

type FoodItemInput = {
	name: string;
	quantity: string;
};

type RecipeIngredientOutput = {
	name: string;
	amount: number;
	unit: string;
};

type RecipeNutritionOutput = {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
};

type RecipeStepOutput = {
	title: string;
	instruction: string;
	timerMinutes: number;
	visualHint: string;
	videoHint: string;
};

type RecipeOutput = {
	title: string;
	description: string;
	prepTimeMinutes: number;
	difficulty: "Easy" | "Medium" | "Hard";
	servings: number;
	tags: string[];
	nutrition: RecipeNutritionOutput;
	ingredients: RecipeIngredientOutput[];
	steps: RecipeStepOutput[];
};

type GeminiModelListResponse = {
	models?: Array<{
		name?: string;
		supportedGenerationMethods?: string[];
	}>;
};

const DEFAULT_RECIPE_MODELS = [
	"gemini-2.5-flash-preview-05-20",
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-latest",
];

function normalizeModelName(modelName: string): string {
	return modelName.trim().replace(/^models\//i, "");
}

function parseModelList(raw: string | undefined): string[] {
	if (!raw || raw.trim().length === 0) {
		return [];
	}

	return Array.from(
		new Set(
			raw
				.split(",")
				.map((model) => normalizeModelName(model))
				.filter((model) => model.length > 0)
		)
	);
}

function rankDiscoveredModel(modelName: string): number {
	const normalized = modelName.toLowerCase();

	if (normalized.includes("flash") && normalized.includes("2.5")) {
		return 0;
	}

	if (normalized.includes("flash") && normalized.includes("2.0")) {
		return 1;
	}

	if (normalized.includes("flash")) {
		return 2;
	}

	if (normalized.includes("pro")) {
		return 3;
	}

	return 4;
}

async function fetchDiscoveredGeminiModels(apiKey: string): Promise<string[]> {
	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
				cache: "no-store",
			}
		);

		if (!response.ok) {
			return [];
		}

		const payload = (await response.json()) as GeminiModelListResponse;

		return (payload.models ?? [])
			.filter((model) =>
				Array.isArray(model.supportedGenerationMethods) &&
				model.supportedGenerationMethods.some(
					(method) => method.toLowerCase() === "generatecontent"
				)
			)
			.map((model) => normalizeModelName(String(model.name ?? "")))
			.filter(
				(model) =>
					model.startsWith("gemini-") &&
					!model.toLowerCase().includes("embedding") &&
					!model.toLowerCase().includes("aqa")
			)
			.sort((a, b) => {
				const rankDelta = rankDiscoveredModel(a) - rankDiscoveredModel(b);
				if (rankDelta !== 0) {
					return rankDelta;
				}

				return a.localeCompare(b);
			});
	} catch {
		return [];
	}
}

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

	return `I have these ingredients: ${list}. Suggest 3 recipes.

Return ONLY a JSON array of recipe objects with this exact structure:
[
  {
    "title": "string",
    "description": "string",
    "prepTimeMinutes": 25,
    "difficulty": "Easy|Medium|Hard",
    "servings": 2,
    "tags": ["quick dinner", "high protein"],
    "nutrition": {
      "calories": 520,
      "protein": 28,
      "carbs": 54,
      "fat": 18
    },
    "ingredients": [
      { "name": "ingredient", "amount": 2, "unit": "pcs" }
    ],
    "steps": [
      {
        "title": "Step title",
        "instruction": "clear instruction",
        "timerMinutes": 8,
        "visualHint": "short visual cue for this step",
        "videoHint": "short optional video cue"
      }
    ]
  }
]

Rules:
- Use only the provided ingredients plus common basics: salt, pepper, water, oil.
- Keep each recipe practical for home cooking.
- Provide 4-8 ingredients and 4-8 steps per recipe.
- Keep nutrition values realistic and as integers.
- Keep tags short and useful (e.g. vegan, gluten-free, quick dinner).
- Do not include markdown, explanations, or code fences.`;
}

function normalizeNumber(value: unknown, fallback: number, max = 9999): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return Math.max(0, Math.min(max, Math.round(parsed)));
}

function normalizeDifficulty(value: unknown): "Easy" | "Medium" | "Hard" {
	const raw = String(value ?? "").trim().toLowerCase();

	if (raw.includes("easy") || raw.includes("beginner")) {
		return "Easy";
	}

	if (raw.includes("hard") || raw.includes("advanced") || raw.includes("difficult")) {
		return "Hard";
	}

	return "Medium";
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((tag) => String(tag ?? "").trim())
			.filter((tag) => tag.length > 0)
			.slice(0, 8);
	}

	if (typeof value === "string") {
		return value
			.split(/,|\n|;/)
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0)
			.slice(0, 8);
	}

	return [];
}

function normalizeNutrition(value: unknown): RecipeNutritionOutput {
	const nutrition = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

	return {
		calories: normalizeNumber(nutrition.calories ?? nutrition.kcal, 400, 2000),
		protein: normalizeNumber(nutrition.protein ?? nutrition.protein_g, 20, 300),
		carbs: normalizeNumber(nutrition.carbs ?? nutrition.carbohydrates ?? nutrition.carbs_g, 40, 400),
		fat: normalizeNumber(nutrition.fat ?? nutrition.fats ?? nutrition.fat_g, 15, 250),
	};
}

function normalizeIngredients(value: unknown): RecipeIngredientOutput[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter((ingredient): ingredient is Record<string, unknown> =>
			typeof ingredient === "object" && ingredient !== null
		)
		.map((ingredient) => {
			const name = String(ingredient.name ?? ingredient.ingredient ?? "").trim();
			const amount = Number(ingredient.amount ?? ingredient.quantity ?? ingredient.qty ?? 0);
			const unit = String(ingredient.unit ?? "pcs").trim() || "pcs";

			return {
				name,
				amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
				unit,
			};
		})
		.filter((ingredient) => ingredient.name.length > 0)
		.slice(0, 12);
}

function normalizeSteps(value: unknown): RecipeStepOutput[] {
	if (Array.isArray(value)) {
		return value
			.map((step, index) => {
				if (typeof step === "string") {
					const instruction = step.trim();
					return {
						title: `Step ${index + 1}`,
						instruction,
						timerMinutes: 0,
						visualHint: "",
						videoHint: "",
					};
				}

				if (typeof step === "object" && step !== null) {
					const entry = step as Record<string, unknown>;
					const instruction = String(entry.instruction ?? entry.step ?? entry.text ?? "").trim();
					const timerMinutes = normalizeNumber(
						entry.timerMinutes ?? entry.timer_minutes ?? entry.durationMinutes ?? entry.duration ?? 0,
						0,
						240
					);

					return {
						title: String(entry.title ?? `Step ${index + 1}`).trim() || `Step ${index + 1}`,
						instruction,
						timerMinutes,
						visualHint: String(entry.visualHint ?? entry.visual_hint ?? "").trim(),
						videoHint: String(entry.videoHint ?? entry.video_hint ?? "").trim(),
					};
				}

				return {
					title: `Step ${index + 1}`,
					instruction: "",
					timerMinutes: 0,
					visualHint: "",
					videoHint: "",
				};
			})
			.filter((step) => step.instruction.length > 0)
			.slice(0, 10);
	}

	if (typeof value === "string") {
		return value
			.split(/\n|\r|\.|;/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.slice(0, 10)
			.map((instruction, index) => ({
				title: `Step ${index + 1}`,
				instruction,
				timerMinutes: 0,
				visualHint: "",
				videoHint: "",
			}));
	}

	return [];
}

function normalizeRecipes(payload: unknown[]): RecipeOutput[] {
	const recipes = payload
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const title = String(item.title ?? "").trim();
			const description = String(item.description ?? "").trim();
			const prepTimeMinutes = normalizeNumber(item.prepTimeMinutes ?? item.prep_time_minutes ?? 0, 25, 300);
			const servings = Math.max(1, normalizeNumber(item.servings ?? item.portions ?? 2, 2, 20));
			const difficulty = normalizeDifficulty(item.difficulty);
			const tags = normalizeTags(item.tags);
			const nutrition = normalizeNutrition(item.nutrition);
			const ingredients = normalizeIngredients(item.ingredients);
			const steps = normalizeSteps(item.steps);

			return {
				title,
				description,
				prepTimeMinutes,
				difficulty,
				servings,
				tags,
				nutrition,
				ingredients,
				steps,
			};
		})
		.filter(
			(recipe) =>
				recipe.title.length > 0 &&
				recipe.description.length > 0 &&
				recipe.steps.length > 0 &&
				recipe.ingredients.length > 0
		)
		.slice(0, 3);

	if (recipes.length === 0) {
		throw new Error("Gemini response JSON did not contain valid recipe objects.");
	}

	return recipes;
}

async function getRecipeModelCandidates(apiKey: string): Promise<string[]> {
	const configuredModels = parseModelList(
		process.env.RECIPE_GEMINI_MODELS && process.env.RECIPE_GEMINI_MODELS.trim().length > 0
			? process.env.RECIPE_GEMINI_MODELS
			: process.env.GEMINI_MODELS
	);

	const discoveredModels = await fetchDiscoveredGeminiModels(apiKey);

	return Array.from(
		new Set([
			...discoveredModels,
			...configuredModels,
			...DEFAULT_RECIPE_MODELS,
		])
	);
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
		const modelCandidates = await getRecipeModelCandidates(apiKey);

		let responseText = "";
		let selectedModel = "";
		let lastError: unknown;
		const attemptErrors: string[] = [];

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
				if (error instanceof Error) {
					attemptErrors.push(`${modelName}: ${error.message}`);
				}
			}
		}

		if (!responseText) {
			if (lastError instanceof Error) {
				const compactAttemptErrors = attemptErrors.slice(0, 6).join(" | ");
				const attemptsSummary = compactAttemptErrors.length > 0 ? ` Tried: ${compactAttemptErrors}` : "";
				throw new Error(
					`No available Gemini model could generate recipes. Last error: ${lastError.message}.${attemptsSummary}`
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