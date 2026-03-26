import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const ANALYZE_PROMPT =
	"Identify all food items in this image. For each item, provide its name, a category (Vegetables, Dairy, Meat, Pantry, or Other), and estimated shelfLifeDays as a number. Return the result strictly as a JSON array.";

const MODEL_CANDIDATES = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash"];

const DEV_FALLBACK_ITEMS = [
	{ name: "Tomatoes", category: "Vegetables", shelfLifeDays: 5 },
	{ name: "Milk", category: "Dairy", shelfLifeDays: 3 },
	{ name: "Rice", category: "Pantry", shelfLifeDays: 180 },
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

function isGeminiQuotaError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return message.includes("429") || message.includes("quota") || message.includes("too many requests");
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

export async function POST(request: Request) {
	try {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Missing GEMINI_API_KEY environment variable." },
				{ status: 500 }
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

		let responseText = "";
		let lastError: unknown;

		for (const modelName of MODEL_CANDIDATES) {
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

				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!responseText) {
			if (lastError instanceof Error) {
				throw lastError;
			}

			throw new Error("Gemini returned an empty response.");
		}

		const items = parseJsonArray(responseText);
		return NextResponse.json(items);
	} catch (error) {
		console.error("Analyze API error:", error);

		if (isGeminiQuotaError(error)) {
			const allowFallback =
				process.env.ALLOW_QUOTA_FALLBACK === "true" || process.env.NODE_ENV !== "production";

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

		const details = error instanceof Error ? error.message : "Unknown error.";

		return NextResponse.json(
			{ error: "Failed to analyze image.", details },
			{ status: 500 }
		);
	}
}
