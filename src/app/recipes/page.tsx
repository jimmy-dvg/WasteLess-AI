"use client";

import BottomNav from "@/components/BottomNav";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { AnimatePresence, motion } from "framer-motion";
import { ChefHat, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type IngredientItem = {
	id: string;
	name: string;
	quantity: number | null;
	expiryDate: string | null;
};

type Recipe = {
	title: string;
	description: string;
	steps: string[];
};

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
		.slice(0, 5);
}

export default function RecipesPage() {
	const router = useRouter();
	const supabase = useMemo(() => getSupabaseBrowserClient(), []);
	const [isAuthChecking, setIsAuthChecking] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [sourceItems, setSourceItems] = useState<IngredientItem[]>([]);
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

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
				setIsAuthChecking(false);
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
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
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, [router, supabase]);

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

		if (!Array.isArray(data)) {
			throw new Error("Invalid recipe response format.");
		}

		const normalized = data
			.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
			.map((item) => {
				const steps = Array.isArray(item.steps)
					? item.steps
							.map((step) => String(step ?? "").trim())
							.filter((step) => step.length > 0)
					: [];

				return {
					title: String(item.title ?? "").trim(),
					description: String(item.description ?? "").trim(),
					steps,
				};
			})
			.filter((item) => item.title.length > 0 && item.description.length > 0 && item.steps.length > 0)
			.slice(0, 3);

		if (normalized.length === 0) {
			throw new Error("No valid recipes were returned.");
		}

		setRecipes(normalized);
	}, [router, supabase]);

	const loadSmartRecipes = useCallback(async () => {
		try {
			if (!isAuthenticated) {
				return;
			}

			setIsLoading(true);
			setErrorMessage(null);
			setSelectedRecipe(null);

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
			<div className="mx-auto w-full max-w-sm">
				<section className="rounded-3xl border border-orange-100/80 bg-white/75 p-5 shadow-[0_20px_45px_-25px_rgba(194,65,12,0.45)] backdrop-blur">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">AI Kitchen</p>
							<h1 className="mt-1 text-3xl font-bold tracking-tight text-orange-950">Smart Recipes</h1>
							<p className="mt-2 text-sm text-amber-800/80">
								Fresh ideas based on what should be cooked first.
							</p>
						</div>
						<div className="rounded-2xl bg-orange-100 p-2 text-orange-600">
							<Sparkles className="h-5 w-5" aria-hidden="true" />
						</div>
					</div>

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
							{[0, 1, 2].map((index) => (
								<div
									key={index}
									className="overflow-hidden rounded-2xl border border-amber-100 bg-white p-4 shadow-sm"
								>
									<motion.div
										className="h-4 w-2/3 rounded bg-amber-100"
										animate={{ opacity: [0.4, 0.9, 0.4] }}
										transition={{ duration: 1.2, delay: index * 0.15, repeat: Number.POSITIVE_INFINITY }}
									/>
									<motion.div
										className="mt-3 h-3 w-full rounded bg-amber-100"
										animate={{ opacity: [0.35, 0.8, 0.35] }}
										transition={{ duration: 1.2, delay: index * 0.2, repeat: Number.POSITIVE_INFINITY }}
									/>
									<motion.div
										className="mt-2 h-3 w-5/6 rounded bg-amber-100"
										animate={{ opacity: [0.35, 0.8, 0.35] }}
										transition={{ duration: 1.2, delay: index * 0.25, repeat: Number.POSITIVE_INFINITY }}
									/>
								</div>
							))}
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

					{!isLoading && !errorMessage && recipes.length > 0 ? (
						<ul className="mt-6 space-y-3">
							{recipes.map((recipe, index) => (
								<motion.li
									key={`${recipe.title}-${index}`}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25, delay: index * 0.08 }}
									className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white via-orange-50/40 to-emerald-50/40 p-4 shadow-[0_14px_30px_-25px_rgba(154,52,18,0.55)]"
								>
									<h2 className="text-lg font-bold text-orange-950">{recipe.title}</h2>
									<p className="mt-2 text-sm leading-relaxed text-amber-900/80">{recipe.description}</p>
									<button
										type="button"
										onClick={() => setSelectedRecipe(recipe)}
										className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
									>
										View Details
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
							className="max-h-[78vh] w-full max-w-md overflow-y-auto rounded-3xl border border-orange-100 bg-white p-5 shadow-2xl"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">Recipe</p>
									<h3 className="mt-1 text-xl font-bold text-orange-950">{selectedRecipe.title}</h3>
								</div>
								<button
									type="button"
									onClick={() => setSelectedRecipe(null)}
									className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
									aria-label="Close recipe details"
								>
									<X className="h-4 w-4" aria-hidden="true" />
								</button>
							</div>

							<p className="mt-3 text-sm text-amber-900/90">{selectedRecipe.description}</p>

							<ol className="mt-4 space-y-2">
								{selectedRecipe.steps.map((step, index) => (
									<li key={`${selectedRecipe.title}-step-${index}`} className="flex gap-2 text-sm text-slate-700">
										<span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
											{index + 1}
										</span>
										<span>{step}</span>
									</li>
								))}
							</ol>
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>

			<BottomNav />
		</main>
	);
}