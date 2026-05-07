import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthenticatedUser } from "@/src/lib/jwt-auth";
import { NextResponse } from "next/server";

type AssistantPayload = {
	recipeTitle: string;
	note: string;
	difficulty?: string;
	servings?: number;
	ingredients?: string[];
	currentStep?: string;
};

const DEFAULT_ASSISTANT_MODELS = [
	"gemini-2.0-flash-lite",
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-latest",
];

function normalizePayload(input: unknown): AssistantPayload {
	if (typeof input !== "object" || input === null) {
		throw new Error("Request body must be an object.");
	}

	const payload = input as Record<string, unknown>;
	const recipeTitle = String(payload.recipeTitle ?? "").trim();
	const note = String(payload.note ?? "").trim();

	if (recipeTitle.length === 0) {
		throw new Error("recipeTitle is required.");
	}

	if (note.length === 0) {
		throw new Error("note is required.");
	}

	return {
		recipeTitle,
		note,
		difficulty: String(payload.difficulty ?? "").trim() || undefined,
		servings: Number.isFinite(Number(payload.servings)) ? Number(payload.servings) : undefined,
		ingredients: Array.isArray(payload.ingredients)
			? payload.ingredients
				.map((item) => String(item ?? "").trim())
				.filter((item) => item.length > 0)
			: undefined,
		currentStep: String(payload.currentStep ?? "").trim() || undefined,
	};
}

function getAssistantModelCandidates(): string[] {
	const assistantModels = process.env.RECIPE_ASSISTANT_GEMINI_MODELS;
	const recipeModels = process.env.RECIPE_GEMINI_MODELS;
	const sharedModels = process.env.GEMINI_MODELS;
	const source =
		assistantModels && assistantModels.trim().length > 0
			? assistantModels
			: recipeModels && recipeModels.trim().length > 0
				? recipeModels
				: sharedModels;

	if (!source || source.trim().length === 0) {
		return DEFAULT_ASSISTANT_MODELS;
	}

	const parsed = source
		.split(",")
		.map((model) => model.trim())
		.filter((model) => model.length > 0);

	if (parsed.length === 0) {
		return DEFAULT_ASSISTANT_MODELS;
	}

	return Array.from(new Set(parsed));
}

function buildAssistantPrompt(payload: AssistantPayload): string {
	const ingredientsText = payload.ingredients && payload.ingredients.length > 0
		? payload.ingredients.join(", ")
		: "Not provided";
	const servingsText = payload.servings && payload.servings > 0 ? String(payload.servings) : "Not provided";
	const difficultyText = payload.difficulty ?? "Not provided";
	const currentStepText = payload.currentStep ?? "Not provided";

	return `You are a practical cooking coach. A user wrote a note while cooking.

Recipe: ${payload.recipeTitle}
Difficulty: ${difficultyText}
Servings: ${servingsText}
Ingredients: ${ingredientsText}
Current step: ${currentStepText}
User note: ${payload.note}

Return concise, actionable guidance with this exact JSON format:
{
  "advice": "2-4 short sentences with what to do next and one safety tip if relevant"
}

Keep the tone friendly and direct. Do not include markdown.`;
}

function parseAdvice(raw: string): string {
	const trimmed = raw.trim();

	const withoutCodeFence = trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();

	try {
		const parsed = JSON.parse(withoutCodeFence);
		if (typeof parsed === "object" && parsed !== null && "advice" in parsed) {
			const advice = String((parsed as { advice?: string }).advice ?? "").trim();
			if (advice.length > 0) {
				return advice;
			}
		}
	} catch {
		// Fallback to raw content.
	}

	if (withoutCodeFence.length > 0) {
		return withoutCodeFence;
	}

	throw new Error("Assistant returned an empty response.");
}

function buildFallbackAdvice(note: string): string {
	const lower = note.toLowerCase();

	if (lower.includes("less sugar") || lower.includes("по-малко захар")) {
		return "Reduce sugar by 20-30%, then balance sweetness with cinnamon or vanilla. Taste before adding more. Add sugar gradually so the texture stays stable.";
	}

	if (lower.includes("salt") || lower.includes("сол")) {
		return "Add salt in very small pinches and mix well before tasting again. If it gets too salty, add a little acid (lemon/vinegar) or dilute with unsalted ingredients. Stop seasoning once flavors feel balanced.";
	}

	if (lower.includes("burn") || lower.includes("изгори") || lower.includes("загаря")) {
		return "Lower heat immediately and move food to a clean pan if possible. Add a small splash of water or stock to prevent further burning. Scrape only the unburned layer and keep stirring gently.";
	}

	return "Adjust one variable at a time: heat, seasoning, or liquid. Taste after each small change and continue only if it improves the dish. Keep the pan at medium heat to avoid overcooking while you correct flavor.";
}

export async function POST(request: Request) {
	try {
		const user = await getAuthenticatedUser(request);
		if (!user) {
			return NextResponse.json(
				{ error: "Unauthorized", details: "Invalid or expired session." },
				{ status: 401 }
			);
		}

		const rawBody: unknown = await request.json();
		const payload = normalizePayload(rawBody);

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return NextResponse.json({ advice: buildFallbackAdvice(payload.note), fallback: true });
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		const modelCandidates = getAssistantModelCandidates();
		const prompt = buildAssistantPrompt(payload);

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
				console.error("Recipes assistant model error:", lastError.message);
			}

			return NextResponse.json({ advice: buildFallbackAdvice(payload.note), fallback: true });
		}

		const advice = parseAdvice(responseText);

		return NextResponse.json(
			{ advice, fallback: false },
			{
				headers: {
					"x-gemini-model": selectedModel,
				},
			}
		);
	} catch (error) {
		const details = error instanceof Error ? error.message : "Unknown error.";
		const status =
			details.includes("required") || details.includes("Request body")
				? 400
				: 500;

		return NextResponse.json(
			{ error: "Failed to generate assistant advice.", details },
			{ status }
		);
	}
}