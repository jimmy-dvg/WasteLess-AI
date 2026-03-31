"use client";

import BottomNav from "@/components/BottomNav";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { AnimatePresence, motion } from "framer-motion";
import {
	ChefHat,
	Clock3,
	Flame,
	Heart,
	Mic,
	MicOff,
	Plus,
	Send,
	Sparkles,
	TimerReset,
	Users,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IngredientItem = {
	id: string;
	name: string;
	quantity: number | null;
	expiryDate: string | null;
};

type RecipeIngredient = {
	name: string;
	amount: number;
	unit: string;
};

type RecipeNutrition = {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
};

type RecipeStep = {
	title: string;
	instruction: string;
	timerMinutes: number;
	visualHint: string;
	videoHint: string;
};

type Recipe = {
	title: string;
	description: string;
	prepTimeMinutes: number;
	difficulty: "Easy" | "Medium" | "Hard";
	servings: number;
	tags: string[];
	nutrition: RecipeNutrition;
	ingredients: RecipeIngredient[];
	steps: RecipeStep[];
};

type FavoriteRecipePayload = {
	title: string;
	description: string;
	instructions: string;
	imageUrl: string | null;
};

type CollectionCapabilities = {
	favorites: boolean;
	notes: boolean;
	shopping: boolean;
};

type CollectionsApiResponse = {
	favorites: FavoriteRecipePayload[];
	notes: Record<string, string>;
	shopping: ShoppingItem[];
	capabilities: CollectionCapabilities;
	warning?: string;
};

type ShoppingItem = {
	name: string;
	amount: number;
	unit: string;
	recipeTitle: string;
};

type ActiveTimerState = {
	recipeTitle: string;
	stepIndex: number;
	endsAt: number;
	totalSeconds: number;
};

type SpeechRecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

type SpeechRecognitionEventLike = {
	results: ArrayLike<{
		isFinal?: boolean;
		0?: {
			transcript?: string;
		};
	}>;
};

type SpeechRecognitionErrorEventLike = {
	error?: string;
};

type VoiceWindow = Window & {
	SpeechRecognition?: new () => SpeechRecognitionLike;
	webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type CollectionStorageMode = "cloud" | "local";

type SupabaseLikeError = {
	code?: string;
	message?: string;
	details?: string;
	hint?: string;
};

const TWO_DAYS_IN_MS = 48 * 60 * 60 * 1000;
const FAVORITES_STORAGE_KEY = "wasteless.favorite-recipes";
const NOTES_STORAGE_KEY = "wasteless.recipe-notes";
const SHOPPING_STORAGE_KEY = "wasteless.shopping-list";

const VOICE_NUMBER_WORDS: Record<string, number> = {
	zero: 0,
	null: 0,
	none: 0,
	nula: 0,
	нула: 0,
	one: 1,
	first: 1,
	edin: 1,
	edna: 1,
	edno: 1,
	един: 1,
	една: 1,
	едно: 1,
	two: 2,
	second: 2,
	dva: 2,
	dve: 2,
	два: 2,
	две: 2,
	three: 3,
	trima: 3,
	tri: 3,
	три: 3,
	four: 4,
	chetiri: 4,
	четири: 4,
	five: 5,
	pet: 5,
	пет: 5,
	six: 6,
	shest: 6,
	шест: 6,
	seven: 7,
	sedem: 7,
	седем: 7,
	eight: 8,
	osem: 8,
	осем: 8,
	nine: 9,
	devet: 9,
	девет: 9,
	ten: 10,
	deset: 10,
	десет: 10,
	eleven: 11,
	edinadeset: 11,
	единадесет: 11,
	twelve: 12,
	dvanadeset: 12,
	дванадесет: 12,
	thirteen: 13,
	trinadeset: 13,
	тринадесет: 13,
	fourteen: 14,
	chetirinadeset: 14,
	четиринадесет: 14,
	fifteen: 15,
	petnadeset: 15,
	петнадесет: 15,
	sixteen: 16,
	shestnadeset: 16,
	шестнадесет: 16,
	seventeen: 17,
	sedemnadeset: 17,
	седемнадесет: 17,
	eighteen: 18,
	osemnadeset: 18,
	осемнадесет: 18,
	nineteen: 19,
	devetnadeset: 19,
	деветнадесет: 19,
	twenty: 20,
	dvadeset: 20,
	двадесет: 20,
	thirty: 30,
	trideset: 30,
	тридесет: 30,
	forty: 40,
	chetirideset: 40,
	четиридесет: 40,
	fifty: 50,
	petdeset: 50,
	петдесет: 50,
	sixty: 60,
	shestdeset: 60,
	шестдесет: 60,
};

function isMissingRecipeCollectionsTableError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const code = String((error as SupabaseLikeError).code ?? "");
	const message = String((error as SupabaseLikeError).message ?? "").toLowerCase();

	return (
		code === "42P01" ||
		message.includes("relation \"favorite_recipes\" does not exist") ||
		message.includes("relation \"recipe_favorites\" does not exist") ||
		message.includes("relation \"recipe_notes\" does not exist") ||
		message.includes("relation \"shopping_list_items\" does not exist")
	);
}

function normalizeVoiceText(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-zA-Zа-яА-Я0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function hasAnyVoicePhrase(input: string, phrases: readonly string[]): boolean {
	return phrases.some((phrase) => input.includes(phrase));
}

function parseSpokenNumber(input: string): number | null {
	const normalized = normalizeVoiceText(input);
	if (!normalized) {
		return null;
	}

	const digitMatch = normalized.match(/\b(\d{1,3})\b/);
	if (digitMatch) {
		const parsed = Number.parseInt(digitMatch[1], 10);
		return Number.isFinite(parsed) ? parsed : null;
	}

	const tokens = normalized.split(" ").filter((token) => token.length > 0);

	for (let index = 0; index < tokens.length; index += 1) {
		const current = VOICE_NUMBER_WORDS[tokens[index]];
		if (current === undefined) {
			continue;
		}

		const next = VOICE_NUMBER_WORDS[tokens[index + 1]];
		if (
			current >= 20 &&
			current % 10 === 0 &&
			next !== undefined &&
			next > 0 &&
			next < 10
		) {
			return current + next;
		}

		return current;
	}

	return null;
}

function extractStepIndexFromVoiceCommand(input: string): number | null {
	const normalized = normalizeVoiceText(input);

	const directMatch = normalized.match(/(?:step|stapka|стъпка)\s*(\d{1,2})/i);
	if (directMatch) {
		const value = Number.parseInt(directMatch[1], 10);
		if (Number.isFinite(value) && value > 0) {
			return value - 1;
		}
	}

	if (!hasAnyVoicePhrase(normalized, ["step", "stapka", "стъпка"])) {
		return null;
	}

	const spokenNumber = parseSpokenNumber(normalized);
	if (spokenNumber === null || spokenNumber <= 0) {
		return null;
	}

	return spokenNumber - 1;
}

function extractTimerMinutesFromVoiceCommand(input: string): number | null {
	const normalized = normalizeVoiceText(input);

	const explicitMatch = normalized.match(
		/(\d{1,3})\s*(?:m|min|mins|minute|minutes|минута|минути|мин)\b/i
	);
	if (explicitMatch) {
		const value = Number.parseInt(explicitMatch[1], 10);
		if (Number.isFinite(value) && value > 0) {
			return Math.min(240, value);
		}
	}

	if (!hasAnyVoicePhrase(normalized, ["timer", "таймер", "min", "мину", "start", "стартирай"])) {
		return null;
	}

	const spokenNumber = parseSpokenNumber(normalized);
	if (spokenNumber === null || spokenNumber <= 0) {
		return null;
	}

	return Math.min(240, spokenNumber);
}

function toErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
		const message = "message" in error ? String((error as { message?: string }).message ?? "") : "";
		const details = "details" in error ? String((error as { details?: string }).details ?? "") : "";
		const hint = "hint" in error ? String((error as { hint?: string }).hint ?? "") : "";
		const combined = [message, details, hint].filter((part) => part.length > 0).join(" ").trim();
		if (combined) {
			return combined;
		}
	}

	return fallback;
}

function addDays(dateInput: string, days: number): string | null {
	const date = new Date(dateInput);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	date.setDate(date.getDate() + days);
	return date.toISOString();
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

function getDifficultyClassName(difficulty: "Easy" | "Medium" | "Hard"): string {
	switch (difficulty) {
		case "Easy":
			return "border-emerald-200 bg-emerald-50 text-emerald-700";
		case "Hard":
			return "border-rose-200 bg-rose-50 text-rose-700";
		default:
			return "border-amber-200 bg-amber-50 text-amber-700";
	}
}

function getTagPalette(index: number): string {
	const palettes = [
		"border-lime-200 bg-lime-50 text-lime-800",
		"border-cyan-200 bg-cyan-50 text-cyan-800",
		"border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
		"border-orange-200 bg-orange-50 text-orange-800",
	];

	return palettes[index % palettes.length];
}

function formatScaledAmount(amount: number): string {
	if (!Number.isFinite(amount) || amount <= 0) {
		return "0";
	}

	if (Math.abs(amount - Math.round(amount)) < 0.01) {
		return String(Math.round(amount));
	}

	return amount.toFixed(1);
}

function buildRecipeInstructions(recipe: Recipe): string {
	return recipe.steps
		.map((step, index) => {
			const stepTitle = step.title.trim() || `Step ${index + 1}`;
			return `${index + 1}. ${stepTitle}: ${step.instruction.trim()}`;
		})
		.join("\n")
		.trim();
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
	if (typeof window === "undefined") {
		return null;
	}

	const speechWindow = window as VoiceWindow;
	return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

async function fetchTopExpiryItems(): Promise<IngredientItem[]> {
	const supabase = getSupabaseBrowserClient();
	const pantryResponse = await supabase
		.from("pantry_items")
		.select("id, name, shelf_life_days, created_at")
		.order("created_at", { ascending: false })
		.limit(20);

	if (pantryResponse.error) {
		throw pantryResponse.error;
	}

	const pantryItems = Array.isArray(pantryResponse.data) ? pantryResponse.data : [];
	return pantryItems
		.map((item) => {
			const createdAt = item.created_at ? String(item.created_at) : "";
			const shelfLifeDays = Number(item.shelf_life_days ?? 0);
			return {
				id: String(item.id ?? ""),
				name: String(item.name ?? "").trim(),
				quantity: null,
				expiryDate:
					createdAt.length > 0 && Number.isFinite(shelfLifeDays)
						? addDays(createdAt, Math.max(0, Math.round(shelfLifeDays)))
						: null,
			};
		})
		.filter((item) => item.id.length > 0 && item.name.length > 0)
		.sort((a, b) => {
			if (!a.expiryDate && !b.expiryDate) {
				return 0;
			}
			if (!a.expiryDate) {
				return 1;
			}
			if (!b.expiryDate) {
				return -1;
			}
			return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
		})
		.slice(0, 6);
}

function normalizeRecipeArray(data: unknown): Recipe[] {
	if (!Array.isArray(data)) {
		throw new Error("Invalid recipe response format.");
	}

	const recipes = data
		.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
		.map((item) => {
			const title = String(item.title ?? "").trim();
			const description = String(item.description ?? "").trim();
			const prepTimeMinutes = normalizeNumber(item.prepTimeMinutes ?? item.prep_time_minutes, 25, 300);
			const difficulty = normalizeDifficulty(item.difficulty);
			const servings = Math.max(1, normalizeNumber(item.servings, 2, 20));

			const tags = Array.isArray(item.tags)
				? item.tags
						.map((tag) => String(tag ?? "").trim())
						.filter((tag) => tag.length > 0)
						.slice(0, 8)
				: [];

			const nutritionRaw =
				typeof item.nutrition === "object" && item.nutrition !== null
					? (item.nutrition as Record<string, unknown>)
					: {};

			const nutrition: RecipeNutrition = {
				calories: normalizeNumber(nutritionRaw.calories ?? nutritionRaw.kcal, 400, 2000),
				protein: normalizeNumber(nutritionRaw.protein ?? nutritionRaw.protein_g, 20, 300),
				carbs: normalizeNumber(nutritionRaw.carbs ?? nutritionRaw.carbohydrates ?? nutritionRaw.carbs_g, 45, 400),
				fat: normalizeNumber(nutritionRaw.fat ?? nutritionRaw.fats ?? nutritionRaw.fat_g, 15, 250),
			};

			const ingredients = Array.isArray(item.ingredients)
				? item.ingredients
						.filter(
							(ingredient): ingredient is Record<string, unknown> =>
								typeof ingredient === "object" && ingredient !== null
						)
						.map((ingredient) => ({
							name: String(ingredient.name ?? ingredient.ingredient ?? "").trim(),
							amount: Number(ingredient.amount ?? ingredient.quantity ?? ingredient.qty ?? 0),
							unit: String(ingredient.unit ?? "pcs").trim() || "pcs",
						}))
						.filter((ingredient) => ingredient.name.length > 0)
						.map((ingredient) => ({
							...ingredient,
							amount: Number.isFinite(ingredient.amount) ? Math.max(0, ingredient.amount) : 0,
						}))
						.slice(0, 16)
				: [];

			const steps = Array.isArray(item.steps)
				? item.steps
						.map((step, index) => {
							if (typeof step === "string") {
								return {
									title: `Step ${index + 1}`,
									instruction: step.trim(),
									timerMinutes: 0,
									visualHint: "",
									videoHint: "",
								};
							}

							if (typeof step === "object" && step !== null) {
								const value = step as Record<string, unknown>;
								return {
									title: String(value.title ?? `Step ${index + 1}`).trim() || `Step ${index + 1}`,
									instruction: String(value.instruction ?? value.step ?? value.text ?? "").trim(),
									timerMinutes: normalizeNumber(
										value.timerMinutes ?? value.timer_minutes ?? value.durationMinutes ?? 0,
										0,
										240
									),
									visualHint: String(value.visualHint ?? value.visual_hint ?? "").trim(),
									videoHint: String(value.videoHint ?? value.video_hint ?? "").trim(),
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
						.slice(0, 12)
				: [];

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
				recipe.ingredients.length > 0 &&
				recipe.steps.length > 0
		)
		.slice(0, 3);

	if (recipes.length === 0) {
		throw new Error("No valid recipes were returned.");
	}

	return recipes;
}

export default function RecipesPage() {
	const router = useRouter();
	const supabase = useMemo(() => getSupabaseBrowserClient(), []);
	const [isAuthChecking, setIsAuthChecking] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [collectionStorageMode, setCollectionStorageMode] = useState<CollectionStorageMode>("cloud");
	const [collectionNoticeMessage, setCollectionNoticeMessage] = useState<string | null>(null);
	const [cloudFavoritesEnabled, setCloudFavoritesEnabled] = useState(false);
	const [cloudNotesEnabled, setCloudNotesEnabled] = useState(false);
	const [cloudShoppingEnabled, setCloudShoppingEnabled] = useState(false);
	const [isCollectionsReady, setIsCollectionsReady] = useState(false);
	const [sourceItems, setSourceItems] = useState<IngredientItem[]>([]);
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
	const [servingsMap, setServingsMap] = useState<Record<string, number>>({});
	const [favoriteRecipes, setFavoriteRecipes] = useState<Set<string>>(new Set());
	const [favoriteRecipePayloads, setFavoriteRecipePayloads] = useState<Record<string, FavoriteRecipePayload>>({});
	const [favoriteToastMessage, setFavoriteToastMessage] = useState<string | null>(null);
	const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
	const [recipeNotes, setRecipeNotes] = useState<Record<string, string>>({});
	const [assistantReplies, setAssistantReplies] = useState<Record<string, string>>({});
	const [isAskingAssistant, setIsAskingAssistant] = useState<string | null>(null);
	const [activeTimer, setActiveTimer] = useState<ActiveTimerState | null>(null);
	const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
	const [activeStepIndex, setActiveStepIndex] = useState<Record<string, number>>({});
	const [isCookMode, setIsCookMode] = useState(false);
	const [voiceEnabled, setVoiceEnabled] = useState(false);
	const [voiceStatus, setVoiceStatus] = useState<string>("Voice mode is off.");

	const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const voiceEnabledRef = useRef(false);
	const skipCloudFavoritesSyncRef = useRef(true);
	const skipCloudShoppingSyncRef = useRef(true);

	useEffect(() => {
		if (!favoriteToastMessage) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setFavoriteToastMessage(null);
		}, 1600);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [favoriteToastMessage]);

	useEffect(() => {
		let isMounted = true;

		const syncAuthState = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!isMounted) {
				return;
			}

			if (!session?.access_token) {
				setIsAuthenticated(false);
				setCurrentUserId(null);
				setIsAuthChecking(false);
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
			setCurrentUserId(session.user.id);
			setIsAuthChecking(false);
		};

		void syncAuthState();

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (!isMounted) {
				return;
			}

			if (!session?.access_token) {
				setIsAuthenticated(false);
				setCurrentUserId(null);
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
			setCurrentUserId(session.user.id);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, [router, supabase]);

	const hydrateCollectionsFromLocalStorage = useCallback(() => {
		try {
			const favoriteRaw = localStorage.getItem(FAVORITES_STORAGE_KEY);
			if (favoriteRaw) {
				const parsed = JSON.parse(favoriteRaw);
				if (Array.isArray(parsed)) {
					setFavoriteRecipes(new Set(parsed.map((item) => String(item))));
					setFavoriteRecipePayloads({});
				}
			}
		} catch {
			setFavoriteRecipes(new Set());
			setFavoriteRecipePayloads({});
		}

		try {
			const notesRaw = localStorage.getItem(NOTES_STORAGE_KEY);
			if (notesRaw) {
				const parsed = JSON.parse(notesRaw);
				if (typeof parsed === "object" && parsed !== null) {
					const normalizedEntries = Object.entries(parsed).map(([key, value]) => [
						String(key),
						String(value ?? ""),
					]);
					setRecipeNotes(Object.fromEntries(normalizedEntries));
				}
			}
		} catch {
			setRecipeNotes({});
		}

		try {
			const shoppingRaw = localStorage.getItem(SHOPPING_STORAGE_KEY);
			if (shoppingRaw) {
				const parsed = JSON.parse(shoppingRaw);
				if (Array.isArray(parsed)) {
					setShoppingList(
						parsed
							.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
							.map((item) => ({
								name: String(item.name ?? "").trim(),
								amount: Number(item.amount ?? 0),
								unit: String(item.unit ?? "pcs").trim() || "pcs",
								recipeTitle: String(item.recipeTitle ?? "").trim(),
							}))
							.filter((item) => item.name.length > 0)
					);
				}
			}
		} catch {
			setShoppingList([]);
		}
	}, []);

	useEffect(() => {
		if (!isAuthenticated || !currentUserId) {
			return;
		}

		let isCancelled = false;

		const loadCollections = async () => {
			setIsCollectionsReady(false);
			setCollectionNoticeMessage(null);
			hydrateCollectionsFromLocalStorage();
			setCloudFavoritesEnabled(false);
			setCloudNotesEnabled(false);
			setCloudShoppingEnabled(false);
			setCollectionStorageMode("local");

			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session?.access_token) {
					router.replace("/login");
					return;
				}

				const response = await fetch("/api/recipes/collections", {
					method: "GET",
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				const payload: unknown = await response.json();

				if (!response.ok) {
					const details =
						typeof payload === "object" && payload !== null && "details" in payload
							? String((payload as { details?: string }).details ?? "")
							: "Failed to load recipe collections.";
					throw new Error(details);
				}

				if (isCancelled) {
					return;
				}

				const collections = payload as CollectionsApiResponse;
				const capabilities = collections.capabilities ?? {
					favorites: false,
					notes: false,
					shopping: false,
				};

				const favoriteRows = (Array.isArray(collections.favorites) ? collections.favorites : [])
					.map((item) => ({
						title: String(item.title ?? "").trim(),
						description: String(item.description ?? "").trim(),
						instructions: String(item.instructions ?? "").trim(),
						imageUrl: item.imageUrl ? String(item.imageUrl) : null,
					}))
					.filter((item) => item.title.length > 0);

				if (capabilities.favorites) {
					setFavoriteRecipes(new Set(favoriteRows.map((item) => item.title)));
					setFavoriteRecipePayloads(
						Object.fromEntries(
							favoriteRows.map((item) => [
								item.title,
								{
									title: item.title,
									description: item.description,
									instructions: item.instructions,
									imageUrl: item.imageUrl,
								} satisfies FavoriteRecipePayload,
							])
						)
					);
				}

				if (capabilities.notes && typeof collections.notes === "object" && collections.notes !== null) {
					const normalizedEntries = Object.entries(collections.notes).map(([key, value]) => [
						String(key),
						String(value ?? ""),
					]);
					setRecipeNotes(Object.fromEntries(normalizedEntries));
				}

				if (capabilities.shopping && Array.isArray(collections.shopping)) {
					setShoppingList(
						collections.shopping
							.map((item) => ({
								name: String(item.name ?? "").trim(),
								amount: Number(item.amount ?? 0),
								unit: String(item.unit ?? "pcs").trim() || "pcs",
								recipeTitle: String(item.recipeTitle ?? "").trim(),
							}))
							.filter((item) => item.name.length > 0)
					);
				}

				setCloudFavoritesEnabled(Boolean(capabilities.favorites));
				setCloudNotesEnabled(Boolean(capabilities.notes));
				setCloudShoppingEnabled(Boolean(capabilities.shopping));
				setCollectionStorageMode(capabilities.favorites ? "cloud" : "local");
				setCollectionNoticeMessage(
					typeof collections.warning === "string" && collections.warning.trim().length > 0
						? collections.warning.trim()
						: null
				);
				skipCloudFavoritesSyncRef.current = true;
				skipCloudShoppingSyncRef.current = true;
			} catch (error) {
				if (isCancelled) {
					return;
				}

				hydrateCollectionsFromLocalStorage();
				setCloudFavoritesEnabled(false);
				setCloudNotesEnabled(false);
				setCloudShoppingEnabled(false);
				setCollectionStorageMode("local");
				skipCloudFavoritesSyncRef.current = true;
				skipCloudShoppingSyncRef.current = true;

				setCollectionNoticeMessage(toErrorMessage(error, "Recipe collections are in local mode."));
			} finally {
				if (!isCancelled) {
					setIsCollectionsReady(true);
				}
			}
		};

		void loadCollections();

		return () => {
			isCancelled = true;
		};
	}, [currentUserId, hydrateCollectionsFromLocalStorage, isAuthenticated, router, supabase]);

	useEffect(() => {
		if (!isCollectionsReady || cloudFavoritesEnabled) {
			return;
		}

		localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoriteRecipes)));
	}, [cloudFavoritesEnabled, favoriteRecipes, isCollectionsReady]);

	useEffect(() => {
		if (!isCollectionsReady || cloudNotesEnabled) {
			return;
		}

		localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(recipeNotes));
	}, [cloudNotesEnabled, isCollectionsReady, recipeNotes]);

	useEffect(() => {
		if (!isCollectionsReady || cloudShoppingEnabled) {
			return;
		}

		localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(shoppingList));
	}, [cloudShoppingEnabled, isCollectionsReady, shoppingList]);

	useEffect(() => {
		if (
			!isCollectionsReady ||
			!cloudFavoritesEnabled ||
			!currentUserId
		) {
			return;
		}

		if (skipCloudFavoritesSyncRef.current) {
			skipCloudFavoritesSyncRef.current = false;
			return;
		}

		let isCancelled = false;

		const syncFavoritesToCloud = async () => {
			const deleteResponse = await supabase.from("favorite_recipes").delete().eq("user_id", currentUserId);
			if (deleteResponse.error) {
				throw deleteResponse.error;
			}

			const rows = Array.from(favoriteRecipes).map((recipeTitle) => ({
				user_id: currentUserId,
				title: recipeTitle,
				description: favoriteRecipePayloads[recipeTitle]?.description ?? "",
				instructions: favoriteRecipePayloads[recipeTitle]?.instructions ?? "",
				image_url: favoriteRecipePayloads[recipeTitle]?.imageUrl ?? null,
			}));

			if (rows.length === 0) {
				return;
			}

			const insertResponse = await supabase.from("favorite_recipes").insert(rows);
			if (insertResponse.error) {
				throw insertResponse.error;
			}
		};

		void syncFavoritesToCloud().catch((error) => {
			if (isCancelled) {
				return;
			}

			if (isMissingRecipeCollectionsTableError(error)) {
				setCloudFavoritesEnabled(false);
				setCollectionStorageMode("local");
				setCollectionNoticeMessage("Favorites switched to local mode because cloud table is missing.");
				return;
			}

			setCollectionNoticeMessage(toErrorMessage(error, "Failed to sync favorite recipes to cloud."));
		});

		return () => {
			isCancelled = true;
		};
	}, [cloudFavoritesEnabled, currentUserId, favoriteRecipePayloads, favoriteRecipes, isCollectionsReady, supabase]);

	useEffect(() => {
		if (
			!isCollectionsReady ||
			!cloudShoppingEnabled ||
			!currentUserId
		) {
			return;
		}

		if (skipCloudShoppingSyncRef.current) {
			skipCloudShoppingSyncRef.current = false;
			return;
		}

		let isCancelled = false;

		const syncShoppingListToCloud = async () => {
			const deleteResponse = await supabase.from("shopping_list_items").delete().eq("user_id", currentUserId);
			if (deleteResponse.error) {
				throw deleteResponse.error;
			}

			const rows = shoppingList.map((item) => ({
				user_id: currentUserId,
				recipe_title: item.recipeTitle,
				name: item.name,
				amount: Number.isFinite(item.amount) ? item.amount : 0,
				unit: item.unit,
			}));

			if (rows.length === 0) {
				return;
			}

			const insertResponse = await supabase.from("shopping_list_items").insert(rows);
			if (insertResponse.error) {
				throw insertResponse.error;
			}
		};

		void syncShoppingListToCloud().catch((error) => {
			if (isCancelled) {
				return;
			}

			if (isMissingRecipeCollectionsTableError(error)) {
				setCloudShoppingEnabled(false);
				setCollectionNoticeMessage("Shopping list switched to local mode because cloud table is missing.");
				return;
			}

			setCollectionNoticeMessage(toErrorMessage(error, "Failed to sync shopping list to cloud."));
		});

		return () => {
			isCancelled = true;
		};
	}, [cloudShoppingEnabled, currentUserId, isCollectionsReady, shoppingList, supabase]);

	const generateRecipes = useCallback(async (ingredients: IngredientItem[]) => {
		if (ingredients.length === 0) {
			throw new Error("No ingredients available yet. Scan food items first.");
		}

		const {
			data: { session },
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			router.replace("/login");
			throw new Error("Please log in to generate recipes.");
		}

		const payload = ingredients.map((item) => ({
			name: item.name,
			quantity: item.quantity !== null ? String(item.quantity) : "unspecified",
		}));

		const response = await fetch("/api/recipes", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify(payload),
		});

		const data: unknown = await response.json();
		if (!response.ok) {
			const details =
				typeof data === "object" && data !== null && "details" in data
					? String((data as { details?: string }).details ?? "")
					: "Failed to generate recipes.";

			throw new Error(details);
		}

		const normalized = normalizeRecipeArray(data);
		setRecipes(normalized);
		setServingsMap(
			Object.fromEntries(normalized.map((recipe) => [recipe.title, recipe.servings]))
		);
		setActiveStepIndex({});
	}, [router, supabase]);

	const loadSmartRecipes = useCallback(async () => {
		try {
			if (!isAuthenticated) {
				return;
			}

			setIsLoading(true);
			setErrorMessage(null);
			setSelectedRecipe(null);
			setIsCookMode(false);

			const ingredients = await fetchTopExpiryItems();
			setSourceItems(ingredients);
			await generateRecipes(ingredients);
		} catch (error) {
			setRecipes([]);
			setErrorMessage(toErrorMessage(error, "Failed to load smart recipes."));
		} finally {
			setIsLoading(false);
		}
	}, [generateRecipes, isAuthenticated]);

	const regenerateRecipes = useCallback(async () => {
		try {
			if (!isAuthenticated) {
				router.replace("/login");
				return;
			}

			setIsRegenerating(true);
			setErrorMessage(null);
			setSelectedRecipe(null);
			setIsCookMode(false);
			await generateRecipes(sourceItems);
		} catch (error) {
			setErrorMessage(toErrorMessage(error, "Failed to regenerate recipes."));
		} finally {
			setIsRegenerating(false);
		}
	}, [generateRecipes, isAuthenticated, router, sourceItems]);

	useEffect(() => {
		if (!isAuthChecking && isAuthenticated) {
			void loadSmartRecipes();
		}
	}, [isAuthChecking, isAuthenticated, loadSmartRecipes]);

	const toggleFavorite = useCallback((recipe: Recipe) => {
		const recipeTitle = recipe.title;
		const alreadyFavorite = favoriteRecipes.has(recipeTitle);

		setFavoriteRecipes((current) => {
			const next = new Set(current);
			if (next.has(recipeTitle)) {
				next.delete(recipeTitle);
			} else {
				next.add(recipeTitle);
			}
			return next;
		});

		if (alreadyFavorite) {
			setFavoriteRecipePayloads((current) => {
				const next = { ...current };
				delete next[recipeTitle];
				return next;
			});
			setFavoriteToastMessage("Removed from Favorites");
			return;
		}

		setFavoriteRecipePayloads((current) => ({
			...current,
			[recipeTitle]: {
				title: recipeTitle,
				description: recipe.description,
				instructions: buildRecipeInstructions(recipe),
				imageUrl: null,
			},
		}));
		setFavoriteToastMessage("Added to Favorites");
	}, [favoriteRecipes]);

	const handleShare = useCallback(async (recipe: Recipe) => {
		const text = `${recipe.title}\n${recipe.description}\nPrep: ${recipe.prepTimeMinutes} min | Servings: ${recipe.servings}`;
		if (typeof navigator !== "undefined" && navigator.share) {
			try {
				await navigator.share({
					title: recipe.title,
					text,
				});
				return;
			} catch {
				// Fallback to clipboard.
			}
		}

		if (typeof navigator !== "undefined" && navigator.clipboard) {
			await navigator.clipboard.writeText(text);
			setErrorMessage("Recipe copied to clipboard for sharing.");
		}
	}, []);

	const updateServings = useCallback((recipeTitle: string, nextServings: number) => {
		setServingsMap((current) => ({
			...current,
			[recipeTitle]: Math.max(1, Math.min(20, Math.round(nextServings))),
		}));
	}, []);

	const addIngredientToShoppingList = useCallback(
		(recipe: Recipe, ingredient: RecipeIngredient) => {
			const selectedServings = servingsMap[recipe.title] ?? recipe.servings;
			const multiplier = selectedServings / recipe.servings;
			const scaledAmount = Math.max(0, ingredient.amount * multiplier);

			setShoppingList((current) => {
				const index = current.findIndex(
					(entry) =>
						entry.recipeTitle === recipe.title &&
						entry.name.toLowerCase() === ingredient.name.toLowerCase() &&
						entry.unit.toLowerCase() === ingredient.unit.toLowerCase()
				);

				if (index === -1) {
					return [
						...current,
						{
							name: ingredient.name,
							amount: scaledAmount,
							unit: ingredient.unit,
							recipeTitle: recipe.title,
						},
					];
				}

				const updated = [...current];
				updated[index] = {
					...updated[index],
					amount: updated[index].amount + scaledAmount,
				};

				return updated;
			});
		},
		[servingsMap]
	);

	const removeShoppingItem = useCallback((index: number) => {
		setShoppingList((current) => current.filter((_, itemIndex) => itemIndex !== index));
	}, []);

	const clearShoppingList = useCallback(() => {
		setShoppingList([]);
	}, []);

	const updateRecipeNote = useCallback((recipeTitle: string, note: string) => {
		setRecipeNotes((current) => ({
			...current,
			[recipeTitle]: note,
		}));
	}, []);

	const persistRecipeNote = useCallback(async (recipeTitle: string) => {
		if (!isCollectionsReady) {
			return;
		}

		const note = String(recipeNotes[recipeTitle] ?? "").trim();

		if (!cloudNotesEnabled) {
			return;
		}

		if (!currentUserId) {
			return;
		}

		try {
			if (note.length === 0) {
				const deleteResponse = await supabase
					.from("recipe_notes")
					.delete()
					.eq("user_id", currentUserId)
					.eq("recipe_title", recipeTitle);

				if (deleteResponse.error) {
					throw deleteResponse.error;
				}

				return;
			}

			const upsertResponse = await supabase.from("recipe_notes").upsert(
				{
					user_id: currentUserId,
					recipe_title: recipeTitle,
					note,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "user_id,recipe_title" }
			);

			if (upsertResponse.error) {
				throw upsertResponse.error;
			}
		} catch (error) {
			if (isMissingRecipeCollectionsTableError(error)) {
				setCloudNotesEnabled(false);
				setCollectionNoticeMessage("Notes switched to local mode because cloud table is missing.");
				return;
			}

			setErrorMessage(toErrorMessage(error, "Failed to save recipe note."));
		}
	}, [cloudNotesEnabled, currentUserId, isCollectionsReady, recipeNotes, supabase]);

	const askAssistantForNote = useCallback(
		async (recipe: Recipe) => {
			const note = (recipeNotes[recipe.title] ?? "").trim();
			if (!note) {
				setErrorMessage("Write a note first so AI can suggest adjustments.");
				return;
			}

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				router.replace("/login");
				return;
			}

			try {
				setIsAskingAssistant(recipe.title);
				setErrorMessage(null);

				const currentStep = recipe.steps[activeStepIndex[recipe.title] ?? 0]?.instruction ?? "";
				const ingredients = recipe.ingredients.map((ingredient) => `${ingredient.name} (${ingredient.amount} ${ingredient.unit})`);

				const response = await fetch("/api/recipes/assistant", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({
						recipeTitle: recipe.title,
						note,
						difficulty: recipe.difficulty,
						servings: servingsMap[recipe.title] ?? recipe.servings,
						ingredients,
						currentStep,
					}),
				});

				const data: unknown = await response.json();
				if (!response.ok) {
					const details =
						typeof data === "object" && data !== null && "details" in data
							? String((data as { details?: string }).details ?? "")
							: "Failed to get AI cooking advice.";
					throw new Error(details);
				}

				const advice =
					typeof data === "object" && data !== null && "advice" in data
						? String((data as { advice?: string }).advice ?? "").trim()
						: "";

				if (!advice) {
					throw new Error("Assistant returned empty advice.");
				}

				setAssistantReplies((current) => ({
					...current,
					[recipe.title]: advice,
				}));
			} catch (error) {
				setErrorMessage(toErrorMessage(error, "Failed to get AI advice for your note."));
			} finally {
				setIsAskingAssistant(null);
			}
		},
		[activeStepIndex, recipeNotes, router, servingsMap, supabase]
	);

	const startStepTimer = useCallback((recipe: Recipe, stepIndex: number, timerMinutes: number) => {
		const totalSeconds = Math.max(1, Math.round(timerMinutes * 60));
		setActiveTimer({
			recipeTitle: recipe.title,
			stepIndex,
			endsAt: Date.now() + totalSeconds * 1000,
			totalSeconds,
		});
		setTimerSecondsLeft(totalSeconds);
	}, []);

	const stopTimer = useCallback(() => {
		setActiveTimer(null);
		setTimerSecondsLeft(0);
	}, []);

	useEffect(() => {
		if (!activeTimer) {
			return;
		}

		const interval = window.setInterval(() => {
			const remaining = Math.max(0, Math.ceil((activeTimer.endsAt - Date.now()) / 1000));
			setTimerSecondsLeft(remaining);

			if (remaining <= 0) {
				window.clearInterval(interval);
				setActiveTimer(null);
				if (typeof window !== "undefined") {
					window.alert("Timer finished. Your step is ready.");
				}
			}
		}, 250);

		return () => {
			window.clearInterval(interval);
		};
	}, [activeTimer]);

	const moveStep = useCallback((recipeTitle: string, direction: "next" | "prev") => {
		const recipe = recipes.find((entry) => entry.title === recipeTitle);
		if (!recipe) {
			return;
		}

		setActiveStepIndex((current) => {
			const now = current[recipeTitle] ?? 0;
			const next = direction === "next" ? now + 1 : now - 1;
			return {
				...current,
				[recipeTitle]: Math.max(0, Math.min(recipe.steps.length - 1, next)),
			};
		});
	}, [recipes]);

	const openRecipeDetails = useCallback((recipe: Recipe) => {
		setSelectedRecipe(recipe);
		setIsCookMode(false);
		setActiveStepIndex((current) => ({
			...current,
			[recipe.title]: current[recipe.title] ?? 0,
		}));
	}, []);

	const closeRecipeDetails = useCallback(() => {
		setSelectedRecipe(null);
		setIsCookMode(false);
	}, []);

	const processVoiceCommand = useCallback(
		(command: string) => {
			const activeRecipe = selectedRecipe;
			if (!activeRecipe) {
				return;
			}

			const normalized = normalizeVoiceText(command);
			if (!normalized) {
				return;
			}

			const setAbsoluteStepIndex = (index: number) => {
				setActiveStepIndex((current) => ({
					...current,
					[activeRecipe.title]: Math.max(0, Math.min(activeRecipe.steps.length - 1, index)),
				}));
			};

			const requestedStepIndex = extractStepIndexFromVoiceCommand(normalized);
			if (requestedStepIndex !== null) {
				setAbsoluteStepIndex(requestedStepIndex);
				setVoiceStatus(
					`Voice: moved to step ${Math.max(1, Math.min(activeRecipe.steps.length, requestedStepIndex + 1))}.`
				);
				return;
			}

			if (
				hasAnyVoicePhrase(normalized, [
					"next",
					"next step",
					"following",
					"следваща",
					"следващата",
					"нататък",
					"напред",
				])
			) {
				moveStep(activeRecipe.title, "next");
				setVoiceStatus(`Voice: moved to next step (${command}).`);
				return;
			}

			if (
				hasAnyVoicePhrase(normalized, [
					"previous",
					"previous step",
					"back",
					"назад",
					"предишна",
					"предишната",
				])
			) {
				moveStep(activeRecipe.title, "prev");
				setVoiceStatus(`Voice: moved to previous step (${command}).`);
				return;
			}

			if (
				hasAnyVoicePhrase(normalized, [
					"stop timer",
					"cancel timer",
					"спри таймера",
					"стоп таймер",
					"спри таймер",
				])
			) {
				stopTimer();
				setVoiceStatus("Voice: timer stopped.");
				return;
			}

			if (
				hasAnyVoicePhrase(normalized, [
					"start timer",
					"timer",
					"таймер",
					"стартирай",
					"пусни",
				])
			) {
				const currentStep = activeRecipe.steps[activeStepIndex[activeRecipe.title] ?? 0];
				const requestedMinutes = extractTimerMinutesFromVoiceCommand(normalized);

				if (requestedMinutes !== null) {
					startStepTimer(activeRecipe, activeStepIndex[activeRecipe.title] ?? 0, requestedMinutes);
					setVoiceStatus(`Voice: started timer for ${requestedMinutes} minutes.`);
					return;
				}

				if (currentStep?.timerMinutes && currentStep.timerMinutes > 0) {
					startStepTimer(activeRecipe, activeStepIndex[activeRecipe.title] ?? 0, currentStep.timerMinutes);
					setVoiceStatus(`Voice: started timer for ${currentStep.timerMinutes} minutes.`);
				} else {
					setVoiceStatus("Voice: this step has no timer configured.");
				}
				return;
			}

			setVoiceStatus(`Voice: command not recognized (${command}).`);
		},
		[activeStepIndex, moveStep, selectedRecipe, startStepTimer, stopTimer]
	);

	const toggleVoiceMode = useCallback(() => {
		if (voiceEnabled) {
			recognitionRef.current?.stop();
			voiceEnabledRef.current = false;
			setVoiceEnabled(false);
			setVoiceStatus("Voice mode is off.");
			return;
		}

		const RecognitionCtor = getSpeechRecognitionCtor();
		if (!RecognitionCtor) {
			setErrorMessage("Voice commands are not supported in this browser.");
			return;
		}

		const recognition = new RecognitionCtor();
		recognition.lang = "bg-BG";
		recognition.continuous = true;
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			const latest = event.results[event.results.length - 1];
			if (!latest?.isFinal) {
				return;
			}

			const transcript = String(latest[0]?.transcript ?? "").trim();
			if (transcript.length > 0) {
				processVoiceCommand(transcript);
			}
		};
		recognition.onerror = (event) => {
			setVoiceStatus(`Voice error: ${event.error ?? "unknown"}`);
		};
		recognition.onend = () => {
			if (voiceEnabledRef.current) {
				try {
					recognition.start();
				} catch {
					voiceEnabledRef.current = false;
					setVoiceEnabled(false);
					setVoiceStatus("Voice mode stopped.");
				}
			}
		};

		try {
			recognition.start();
			recognitionRef.current = recognition;
			voiceEnabledRef.current = true;
			setVoiceEnabled(true);
			setVoiceStatus("Voice mode is on. Try: следваща, предишна, стъпка 3, пусни таймер 5 минути.");
		} catch {
			setErrorMessage("Could not start voice recognition. Please allow microphone access.");
		}
	}, [processVoiceCommand, voiceEnabled]);

	useEffect(() => {
		voiceEnabledRef.current = voiceEnabled;
	}, [voiceEnabled]);

	useEffect(() => {
		return () => {
			voiceEnabledRef.current = false;
			recognitionRef.current?.stop();
		};
	}, []);

	const recipeCards = useMemo(() => {
		return recipes.map((recipe) => {
			const favorite = favoriteRecipes.has(recipe.title);
			const selectedServings = servingsMap[recipe.title] ?? recipe.servings;
			const expiringSourceCount = sourceItems.filter((item) => {
				if (!item.expiryDate) {
					return false;
				}

				const diff = new Date(item.expiryDate).getTime() - Date.now();
				return diff > 0 && diff <= TWO_DAYS_IN_MS;
			}).length;

			return {
				recipe,
				favorite,
				selectedServings,
				expiringSourceCount,
			};
		});
	}, [favoriteRecipes, recipes, servingsMap, sourceItems]);

	const totalShoppingItems = shoppingList.length;

	const selectedRecipeStepIndex = selectedRecipe
		? Math.max(
			0,
			Math.min(selectedRecipe.steps.length - 1, activeStepIndex[selectedRecipe.title] ?? 0)
		)
		: 0;

	const selectedCookStep = selectedRecipe ? selectedRecipe.steps[selectedRecipeStepIndex] : null;

	if (isAuthChecking) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#fffbeb_42%,_#ecfdf5_100%)] px-4">
				<p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
					Checking session...
				</p>
			</main>
		);
	}

	if (!isAuthenticated) {
		return null;
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#fffbeb_42%,_#ecfdf5_100%)] px-4 py-8 pb-28">
			<AnimatePresence>
				{favoriteToastMessage ? (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 shadow-lg"
					>
						{favoriteToastMessage}
					</motion.div>
				) : null}
			</AnimatePresence>

			<div className="mx-auto w-full max-w-sm">
				<section className="rounded-3xl border border-orange-100/80 bg-white/75 p-5 shadow-[0_20px_45px_-25px_rgba(194,65,12,0.45)] backdrop-blur">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">AI Kitchen</p>
							<h1 className="mt-1 text-3xl font-bold tracking-tight text-orange-950">Smart Recipes</h1>
							<p className="mt-2 text-sm text-amber-800/80">
								Full recipe cards with timing, servings, nutrition, and cooking guidance.
							</p>
						</div>
						<div className="rounded-2xl bg-orange-100 p-2 text-orange-600">
							<Sparkles className="h-5 w-5" aria-hidden="true" />
						</div>
					</div>

					<div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
						<p className="text-xs font-semibold text-emerald-800">Shopping List</p>
						<div className="flex items-center gap-2">
							<span
								className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
									collectionStorageMode === "cloud"
										? "border-emerald-300 bg-white text-emerald-700"
										: "border-amber-300 bg-amber-100 text-amber-800"
								}`}
							>
								{collectionStorageMode === "cloud" ? "Cloud Sync" : "Local Mode"}
							</span>
							<span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-700">
								{totalShoppingItems}
							</span>
							<button
								type="button"
								onClick={clearShoppingList}
								className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
							>
								Clear
							</button>
						</div>
					</div>

					{shoppingList.length > 0 ? (
						<ul className="mt-2 space-y-1.5 rounded-xl border border-emerald-100 bg-white px-2.5 py-2">
							{shoppingList.map((item, index) => (
								<li key={`${item.recipeTitle}-${item.name}-${index}`} className="flex items-center justify-between gap-2 text-xs text-slate-700">
									<span>
										{item.name}: {formatScaledAmount(item.amount)} {item.unit}
									</span>
									<button
										type="button"
										onClick={() => removeShoppingItem(index)}
										className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
									>
										Remove
									</button>
								</li>
							))}
						</ul>
					) : null}

					{collectionNoticeMessage ? (
						<p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							{collectionNoticeMessage}
						</p>
					) : null}

					{!isLoading && !errorMessage && recipes.length > 0 ? (
						<button
							type="button"
							onClick={() => void regenerateRecipes()}
							disabled={isRegenerating}
							className="mt-4 inline-flex items-center rounded-xl border border-orange-300 bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:border-orange-200 disabled:bg-orange-300"
						>
							{isRegenerating ? "Regenerating..." : "Regenerate recipes"}
						</button>
					) : null}

					{sourceItems.length > 0 ? (
						<div className="mt-4 flex flex-wrap gap-2">
							{sourceItems.map((item) => (
								<span
									key={item.id}
									className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
								>
									{item.name}
								</span>
							))}
						</div>
					) : null}

					{isLoading || isRegenerating ? (
						<div className="mt-6 space-y-3">
							<motion.div
								initial={{ opacity: 0.6, y: 0 }}
								animate={{ opacity: [0.6, 1, 0.6], y: [0, -3, 0] }}
								transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
								className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-700"
							>
								<ChefHat className="h-5 w-5" aria-hidden="true" />
								{isRegenerating ? "Chef is creating new ideas..." : "Chef is thinking..."}
							</motion.div>
						</div>
					) : null}

					{errorMessage ? (
						<div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							<p>{errorMessage}</p>
							<button
								type="button"
								onClick={() => void loadSmartRecipes()}
								className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
							>
								Try Again
							</button>
						</div>
					) : null}

					{!isLoading && !errorMessage && recipeCards.length > 0 ? (
						<ul className="mt-6 space-y-3">
							{recipeCards.map(({ recipe, favorite, selectedServings, expiringSourceCount }, index) => (
								<motion.li
									key={`${recipe.title}-${index}`}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25, delay: index * 0.08 }}
									className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white via-orange-50/40 to-emerald-50/40 p-4 shadow-[0_14px_30px_-25px_rgba(154,52,18,0.55)]"
								>
									<div className="flex items-start justify-between gap-2">
										<h2 className="text-lg font-bold text-orange-950">{recipe.title}</h2>
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => toggleFavorite(recipe)}
												className={`rounded-full border p-2 transition ${
													favorite
														? "border-rose-300 bg-rose-100 text-rose-600"
														: "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
												}`}
												aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
											>
												<Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} aria-hidden="true" />
											</button>
											<button
												type="button"
												onClick={() => void handleShare(recipe)}
												className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"
												aria-label="Share recipe"
											>
												<Send className="h-4 w-4" aria-hidden="true" />
											</button>
										</div>
									</div>

									<p className="mt-2 text-sm leading-relaxed text-amber-900/80">{recipe.description}</p>

									<div className="mt-3 grid grid-cols-3 gap-2">
										<div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
											<p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Time</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.prepTimeMinutes} min</p>
										</div>
										<div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
											<p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Difficulty</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.difficulty}</p>
										</div>
										<div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
											<p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Serves</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{selectedServings}</p>
										</div>
									</div>

									<div className="mt-3 flex flex-wrap gap-1.5">
										<span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getDifficultyClassName(recipe.difficulty)}`}>
											{recipe.difficulty}
										</span>
										{recipe.tags.slice(0, 3).map((tag, tagIndex) => (
											<span
												key={`${recipe.title}-tag-${tag}`}
												className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTagPalette(tagIndex)}`}
											>
												{tag}
											</span>
										))}
									</div>

									<div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-center">
										<div>
											<p className="text-[10px] font-semibold uppercase text-slate-500">Kcal</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.nutrition.calories}</p>
										</div>
										<div>
											<p className="text-[10px] font-semibold uppercase text-slate-500">Protein</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.nutrition.protein}g</p>
										</div>
										<div>
											<p className="text-[10px] font-semibold uppercase text-slate-500">Carbs</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.nutrition.carbs}g</p>
										</div>
										<div>
											<p className="text-[10px] font-semibold uppercase text-slate-500">Fat</p>
											<p className="mt-1 text-xs font-bold text-slate-800">{recipe.nutrition.fat}g</p>
										</div>
									</div>

									{expiringSourceCount > 0 ? (
										<p className="mt-3 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
											<Flame className="h-3.5 w-3.5" aria-hidden="true" />
											Uses {expiringSourceCount} ingredient{expiringSourceCount === 1 ? "" : "s"} near expiry
										</p>
									) : null}

									<button
										type="button"
										onClick={() => openRecipeDetails(recipe)}
										className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
									>
										View Full Recipe
									</button>
								</motion.li>
							))}
						</ul>
					) : null}
				</section>
			</div>

			<AnimatePresence>
				{selectedRecipe ? (
					<motion.div
						className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-4 sm:items-center"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					>
						<motion.div
							initial={{ y: 30, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: 18, opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="max-h-[84vh] w-full max-w-md overflow-y-auto rounded-3xl border border-orange-100 bg-white p-5 shadow-2xl"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">Recipe Keeper</p>
									<h3 className="mt-1 text-xl font-bold text-orange-950">{selectedRecipe.title}</h3>
								</div>
								<button
									type="button"
									onClick={closeRecipeDetails}
									className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
									aria-label="Close recipe details"
								>
									<X className="h-4 w-4" aria-hidden="true" />
								</button>
							</div>

							<p className="mt-2 text-sm text-amber-900/90">{selectedRecipe.description}</p>

							<div className="mt-3 flex items-center justify-between gap-2">
								<button
									type="button"
									onClick={() => setIsCookMode((current) => !current)}
									className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
										isCookMode
											? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
											: "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
									}`}
								>
									{isCookMode ? "Exit Cook Mode" : "Cook Mode"}
								</button>
								<p className="text-xs font-semibold text-slate-500">
									Step {selectedRecipeStepIndex + 1}/{selectedRecipe.steps.length}
								</p>
							</div>

							{isCookMode && selectedCookStep ? (
								<div className="mt-4 space-y-3">
									<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
											Focused Step
										</p>
										<h4 className="mt-1 text-lg font-bold text-emerald-900">{selectedCookStep.title}</h4>
										<p className="mt-3 text-lg leading-relaxed text-slate-800">{selectedCookStep.instruction}</p>
										{selectedCookStep.visualHint ? (
											<p className="mt-2 text-sm text-slate-600">Visual: {selectedCookStep.visualHint}</p>
										) : null}
										{selectedCookStep.videoHint ? (
											<p className="mt-1 text-sm text-slate-600">Video cue: {selectedCookStep.videoHint}</p>
										) : null}
									</div>

									<div className="grid grid-cols-2 gap-2">
										<button
											type="button"
											onClick={() => moveStep(selectedRecipe.title, "prev")}
											className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
										>
											Previous Step
										</button>
										<button
											type="button"
											onClick={() => moveStep(selectedRecipe.title, "next")}
											className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
										>
											Next Step
										</button>
									</div>

									{selectedCookStep.timerMinutes > 0 ? (
										<button
											type="button"
											onClick={() =>
												startStepTimer(selectedRecipe, selectedRecipeStepIndex, selectedCookStep.timerMinutes)
											}
											className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300 bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-200"
										>
											<Clock3 className="h-4 w-4" aria-hidden="true" />
											Start Step Timer ({selectedCookStep.timerMinutes}m)
										</button>
									) : null}

									{activeTimer ? (
										<div className="flex items-center justify-between rounded-xl border border-orange-300 bg-white px-3 py-2">
											<p className="text-sm font-semibold text-orange-800">
												Timer: {Math.floor(timerSecondsLeft / 60)}m {timerSecondsLeft % 60}s
											</p>
											<button
												type="button"
												onClick={stopTimer}
												className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
											>
												<TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
												Stop
											</button>
										</div>
									) : null}

									<div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
										<div className="flex items-center justify-between gap-2">
											<p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Hands-free Voice</p>
											<button
												type="button"
												onClick={toggleVoiceMode}
												className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
													voiceEnabled
														? "border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
														: "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
												}`}
											>
												{voiceEnabled ? <MicOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-3.5 w-3.5" aria-hidden="true" />}
												{voiceEnabled ? "Stop" : "Start"}
											</button>
										</div>
										<p className="mt-1 text-[11px] text-indigo-700">{voiceStatus}</p>
									</div>
								</div>
							) : (
								<>
									<div className="mt-3 grid grid-cols-3 gap-2">
										<div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center text-xs text-slate-700">
											<Clock3 className="mx-auto h-4 w-4 text-slate-500" aria-hidden="true" />
											<p className="mt-1 font-semibold">{selectedRecipe.prepTimeMinutes} min</p>
										</div>
										<div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center text-xs text-slate-700">
											<ChefHat className="mx-auto h-4 w-4 text-slate-500" aria-hidden="true" />
											<p className="mt-1 font-semibold">{selectedRecipe.difficulty}</p>
										</div>
										<div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-center text-xs text-slate-700">
											<Users className="mx-auto h-4 w-4 text-slate-500" aria-hidden="true" />
											<p className="mt-1 font-semibold">{servingsMap[selectedRecipe.title] ?? selectedRecipe.servings}</p>
										</div>
									</div>

									<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
										<p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Servings Scale</p>
										<div className="mt-2 flex items-center gap-2">
											<button
												type="button"
												onClick={() => updateServings(selectedRecipe.title, (servingsMap[selectedRecipe.title] ?? selectedRecipe.servings) - 1)}
												className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
											>
												-
											</button>
											<p className="w-14 text-center text-sm font-bold text-amber-900">
												{servingsMap[selectedRecipe.title] ?? selectedRecipe.servings}
											</p>
											<button
												type="button"
												onClick={() => updateServings(selectedRecipe.title, (servingsMap[selectedRecipe.title] ?? selectedRecipe.servings) + 1)}
												className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
											>
												+
											</button>
										</div>
									</div>

									<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
										<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Nutrition (per serving)</p>
										<div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
											<div className="rounded-lg bg-slate-100 px-1 py-1.5">
												<p className="text-[10px] text-slate-500">Kcal</p>
												<p className="text-xs font-bold text-slate-800">{selectedRecipe.nutrition.calories}</p>
											</div>
											<div className="rounded-lg bg-slate-100 px-1 py-1.5">
												<p className="text-[10px] text-slate-500">Protein</p>
												<p className="text-xs font-bold text-slate-800">{selectedRecipe.nutrition.protein}g</p>
											</div>
											<div className="rounded-lg bg-slate-100 px-1 py-1.5">
												<p className="text-[10px] text-slate-500">Carbs</p>
												<p className="text-xs font-bold text-slate-800">{selectedRecipe.nutrition.carbs}g</p>
											</div>
											<div className="rounded-lg bg-slate-100 px-1 py-1.5">
												<p className="text-[10px] text-slate-500">Fat</p>
												<p className="text-xs font-bold text-slate-800">{selectedRecipe.nutrition.fat}g</p>
											</div>
										</div>
									</div>

									<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
										<div className="flex items-center justify-between">
											<p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ingredients</p>
											<span className="text-[11px] font-semibold text-emerald-700">Tap + to shopping list</span>
										</div>
										<ul className="mt-2 space-y-2">
											{selectedRecipe.ingredients.map((ingredient) => {
												const selectedServings = servingsMap[selectedRecipe.title] ?? selectedRecipe.servings;
												const multiplier = selectedServings / selectedRecipe.servings;
												const scaledAmount = ingredient.amount * multiplier;

												return (
													<li
														key={`${selectedRecipe.title}-${ingredient.name}`}
														className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-2.5 py-2 text-sm text-slate-700"
													>
														<span>
															{ingredient.name}: {formatScaledAmount(scaledAmount)} {ingredient.unit}
														</span>
														<button
															type="button"
															onClick={() => addIngredientToShoppingList(selectedRecipe, ingredient)}
															className="rounded-lg border border-emerald-200 bg-emerald-100 p-1 text-emerald-700 transition hover:bg-emerald-200"
															aria-label={`Add ${ingredient.name} to shopping list`}
														>
															<Plus className="h-3.5 w-3.5" aria-hidden="true" />
														</button>
													</li>
												);
											})}
										</ul>
									</div>

									<div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-3">
										<div className="flex items-center justify-between">
											<p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Step by Step</p>
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => moveStep(selectedRecipe.title, "prev")}
													className="rounded-lg border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-100"
												>
													Prev
												</button>
												<button
													type="button"
													onClick={() => moveStep(selectedRecipe.title, "next")}
													className="rounded-lg border border-orange-300 bg-white px-2 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-100"
												>
													Next
												</button>
											</div>
										</div>
										<ol className="mt-2 space-y-2">
											{selectedRecipe.steps.map((step, index) => {
												const isActive = (activeStepIndex[selectedRecipe.title] ?? 0) === index;
												const timerRunning =
													activeTimer?.recipeTitle === selectedRecipe.title && activeTimer.stepIndex === index;

												return (
													<li
														key={`${selectedRecipe.title}-step-${index}`}
														className={`rounded-xl border px-2.5 py-2 text-sm ${
															isActive
																? "border-orange-300 bg-white shadow-sm"
																: "border-orange-100 bg-orange-50/40"
														}`}
													>
														<div className="flex items-start justify-between gap-2">
															<div>
																<p className="font-semibold text-orange-900">{step.title}</p>
																<p className="mt-1 text-slate-700">{step.instruction}</p>
															</div>
															{step.timerMinutes > 0 ? (
																<button
																	type="button"
																	onClick={() => startStepTimer(selectedRecipe, index, step.timerMinutes)}
																	className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-100"
																>
																	<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
																	{timerRunning ? `${timerSecondsLeft}s` : `${step.timerMinutes}m`}
																</button>
															) : null}
														</div>
														{step.visualHint ? (
															<p className="mt-1 text-[11px] text-slate-500">Visual: {step.visualHint}</p>
														) : null}
														{step.videoHint ? (
															<p className="mt-1 text-[11px] text-slate-500">Video cue: {step.videoHint}</p>
														) : null}
													</li>
												);
											})}
										</ol>
										{activeTimer ? (
											<div className="mt-2 flex items-center justify-between rounded-xl border border-orange-300 bg-white px-2.5 py-2">
												<p className="text-xs font-semibold text-orange-800">
													Timer: {Math.floor(timerSecondsLeft / 60)}m {timerSecondsLeft % 60}s
												</p>
												<button
													type="button"
													onClick={stopTimer}
													className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-100"
												>
													<TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
													Stop
												</button>
											</div>
										) : null}
									</div>

									<div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
										<div className="flex items-center justify-between gap-2">
											<p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Hands-free Voice</p>
											<button
												type="button"
												onClick={toggleVoiceMode}
												className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
													voiceEnabled
														? "border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
														: "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
												}`}
											>
												{voiceEnabled ? <MicOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-3.5 w-3.5" aria-hidden="true" />}
												{voiceEnabled ? "Stop" : "Start"}
											</button>
										</div>
										<p className="mt-1 text-[11px] text-indigo-700">{voiceStatus}</p>
									</div>

									<div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
										<p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Personal Notes + AI Coach</p>
										<textarea
											value={recipeNotes[selectedRecipe.title] ?? ""}
											onChange={(event) => updateRecipeNote(selectedRecipe.title, event.target.value)}
											onBlur={() => void persistRecipeNote(selectedRecipe.title)}
											placeholder="Example: I used less sugar. What should I adjust next?"
											className="mt-2 min-h-[88px] w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none"
										/>
										<button
											type="button"
											onClick={() => void askAssistantForNote(selectedRecipe)}
											disabled={isAskingAssistant === selectedRecipe.title}
											className="mt-2 inline-flex items-center gap-1 rounded-xl border border-sky-300 bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{isAskingAssistant === selectedRecipe.title ? "AI is thinking..." : "Get AI cooking advice"}
										</button>
										{assistantReplies[selectedRecipe.title] ? (
											<p className="mt-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-slate-700">
												{assistantReplies[selectedRecipe.title]}
											</p>
										) : null}
									</div>
								</>
							)}
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>

			<BottomNav />
		</main>
	);
}
