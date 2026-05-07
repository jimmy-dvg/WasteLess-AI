"use client";

import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/src/lib/use-auth";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Heart, Leaf, Settings2, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import getSupabaseBrowserClient from "@/src/lib/supabase-browser";

type ProfileTab = "favorites" | "settings";

type FavoriteRecipe = {
	id: string;
	title: string;
	description: string;
	instructions: string;
	imageUrl: string | null;
	createdAt: string;
};

const DIETARY_OPTIONS = [
	"No Preference",
	"Vegan",
	"Vegetarian",
	"Keto",
	"Pescatarian",
	"Gluten-Free",
	"High Protein",
	"Low Carb",
];

const SETTINGS_KEYS = {
	expiryNotifications: "wasteless.settings.expiry-notifications",
	dietaryPreference: "wasteless.settings.dietary-preference",
} as const;

function formatDateLabel(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Recently";
	}

	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
	});
}

function getDisplayName(email: string | null, metadata: unknown): string {
	if (typeof metadata === "object" && metadata !== null) {
		const record = metadata as Record<string, unknown>;
		const fullName = String(record.full_name ?? "").trim();
		if (fullName.length > 0) {
			return fullName;
		}

		const name = String(record.name ?? "").trim();
		if (name.length > 0) {
			return name;
		}
	}

	if (email && email.includes("@")) {
		return email.split("@")[0];
	}

	return "WasteLess Hero";
}

function getAvatarUrl(metadata: unknown): string | null {
	if (typeof metadata !== "object" || metadata === null) {
		return null;
	}

	const record = metadata as Record<string, unknown>;
	const value = String(record.avatar_url ?? "").trim();
	return value.length > 0 ? value : null;
}

function getInitials(name: string): string {
	const parts = name
		.split(" ")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.length === 0) {
		return "WL";
	}

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getRecipePreview(recipe: FavoriteRecipe): string {
	const base = recipe.description.trim() || recipe.instructions.trim();
	if (!base) {
		return "Saved from your smart recipe generation.";
	}

	return base.length > 110 ? `${base.slice(0, 107)}...` : base;
}

function isMissingFavoriteRecipesTable(errorCode: string): boolean {
	return errorCode === "42P01";
}

export default function ProfilePage() {
	const router = useRouter();
	const supabase = useMemo(() => getSupabaseBrowserClient(), []);
	const { session: authSession, isLoading: isAuthLoading, getAuthHeader } = useAuth();

	const [isAuthChecking, setIsAuthChecking] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [displayName, setDisplayName] = useState("WasteLess Hero");
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [sustainabilityScore, setSustainabilityScore] = useState(0);
	const [favorites, setFavorites] = useState<FavoriteRecipe[]>([]);
	const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<ProfileTab>("favorites");
	const [expiryNotifications, setExpiryNotifications] = useState(true);
	const [dietaryPreference, setDietaryPreference] = useState(DIETARY_OPTIONS[0]);
	const [settingsReady, setSettingsReady] = useState(false);

	useEffect(() => {
		let isMounted = true;

		const initAuth = async () => {
			if (isAuthLoading) return;

			if (!authSession?.isAuthenticated) {
				if (isMounted) {
					setIsAuthenticated(false);
					setCurrentUserId(null);
					setIsAuthChecking(false);
					router.replace("/login");
				}
				return;
			}

			// Try to decode token to extract user id/email
			try {
				const token = authSession.token;
				if (token) {
					const parts = token.split(".");
					if (parts.length >= 2) {
						const payload = JSON.parse(atob(parts[1]));
						if (isMounted) {
							setIsAuthenticated(true);
							setCurrentUserId(String(payload.userId ?? payload.user_id ?? ""));
							setDisplayName(getDisplayName(String(payload.email ?? null), null));
							setAvatarUrl(null);
							setIsAuthChecking(false);
						}
						return;
					}
				}
			} catch (err) {
				// fallthrough to legacy supabase session retrieval
			}

			// Fallback: try to read session from supabase shim
			try {
				const { data: { session } } = await supabase.auth.getSession();
				if (!isMounted) return;
				if (!session?.access_token) {
					setIsAuthenticated(false);
					setCurrentUserId(null);
					setIsAuthChecking(false);
					router.replace("/login");
					return;
				}

				setIsAuthenticated(true);
				setCurrentUserId((session as any).user.id);
				setDisplayName(getDisplayName((session as any).user.email ?? null, (session as any).user.user_metadata));
				setAvatarUrl(getAvatarUrl((session as any).user.user_metadata));
				setIsAuthChecking(false);
			} catch (err) {
				if (isMounted) {
					setIsAuthenticated(false);
					setCurrentUserId(null);
					setIsAuthChecking(false);
					router.replace("/login");
				}
			}
		};

		void initAuth();

		return () => {
			isMounted = false;
		};
	}, [router, supabase, authSession, isAuthLoading]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const savedExpiry = localStorage.getItem(SETTINGS_KEYS.expiryNotifications);
		if (savedExpiry === "true" || savedExpiry === "false") {
			setExpiryNotifications(savedExpiry === "true");
		}

		const savedDiet = localStorage.getItem(SETTINGS_KEYS.dietaryPreference);
		if (savedDiet && DIETARY_OPTIONS.includes(savedDiet)) {
			setDietaryPreference(savedDiet);
		}

		setSettingsReady(true);
	}, []);

	useEffect(() => {
		if (!settingsReady || typeof window === "undefined") {
			return;
		}

		localStorage.setItem(SETTINGS_KEYS.expiryNotifications, String(expiryNotifications));
	}, [expiryNotifications, settingsReady]);

	useEffect(() => {
		if (!settingsReady || typeof window === "undefined") {
			return;
		}

		localStorage.setItem(SETTINGS_KEYS.dietaryPreference, dietaryPreference);
	}, [dietaryPreference, settingsReady]);

	useEffect(() => {
		if (!isAuthenticated || !currentUserId) {
			return;
		}

		let isCancelled = false;

		const loadProfileData = async () => {
			setIsLoadingFavorites(true);
			setErrorMessage(null);

			try {
				const headers = getAuthHeader();
				if (!headers.Authorization && !headers.authorization) {
					router.replace("/login");
					return;
				}

				const [collectionsRes, pantryRes] = await Promise.all([
					fetch("/api/recipes/collections", { headers }),
					fetch("/api/pantry", { headers }),
				]);

				if (!collectionsRes.ok) {
					const payload = await collectionsRes.json().catch(() => ({}));
					throw new Error(String(payload?.details ?? "Failed to load favorites."));
				}

				if (!pantryRes.ok) {
					const payload = await pantryRes.json().catch(() => ({}));
					throw new Error(String(payload?.details ?? "Failed to load pantry count."));
				}

				const collections = (await collectionsRes.json()) as any;
				const pantryData = (await pantryRes.json()) as any;

				if (isCancelled) return;

				setFavorites(
					Array.isArray(collections.favorites)
						? collections.favorites
							.map((item: any) => ({
								id: String(item.id ?? ""),
								title: String(item.title ?? "").trim(),
								description: String(item.description ?? "").trim(),
								instructions: String(item.instructions ?? "").trim(),
								imageUrl: item.imageUrl ? String(item.imageUrl) : null,
								createdAt: String(item.createdAt ?? ""),
							}))
							.filter((it: any) => it.title.length > 0)
						: []
				);

				setSustainabilityScore(Array.isArray(pantryData) ? pantryData.length : Number(pantryData?.length ?? 0));

				if (collections.warning) {
					setErrorMessage(String(collections.warning));
				}
			} catch (error) {
				if (isCancelled) return;
				setErrorMessage(error instanceof Error ? error.message : String(error ?? "Could not load profile data."));
			} finally {
				if (!isCancelled) setIsLoadingFavorites(false);
			}
		};

		void loadProfileData();

		return () => {
			isCancelled = true;
		};
	}, [currentUserId, isAuthenticated, supabase]);

	if (isAuthChecking) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
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
		<main className="min-h-screen bg-slate-50 px-4 py-6 pb-28">
			<div className="mx-auto w-full max-w-sm space-y-4">
				<section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-4 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)]">
					<div className="flex items-center gap-3">
						{avatarUrl ? (
							<Image
								src={avatarUrl}
								alt={`${displayName} avatar`}
								width={56}
								height={56}
								unoptimized
								className="h-14 w-14 rounded-2xl border border-white object-cover shadow-sm"
							/>
						) : (
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-100 text-lg font-bold text-emerald-700">
								{getInitials(displayName)}
							</div>
						)}

						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">WasteLess Profile</p>
							<h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{displayName}</h1>
						</div>
					</div>

					<div className="mt-4 rounded-2xl border border-emerald-100 bg-white/90 p-3">
						<div className="flex items-center gap-2 text-emerald-700">
							<Leaf className="h-4 w-4" aria-hidden="true" />
							<p className="text-xs font-semibold uppercase tracking-wide">Sustainability Score</p>
						</div>
						<p className="mt-1 text-xl font-bold text-emerald-900">{sustainabilityScore} items saved</p>
					</div>
				</section>

				{errorMessage ? (
					<p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
						{errorMessage}
					</p>
				) : null}

				<section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
					<div className="relative grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
						{(["favorites", "settings"] as const).map((tab) => {
							const isActive = activeTab === tab;
							const Icon = tab === "favorites" ? Heart : Settings2;

							return (
								<button
									key={tab}
									type="button"
									onClick={() => setActiveTab(tab)}
									className={`relative z-10 inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
										isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
									}`}
								>
									<Icon className="h-3.5 w-3.5" aria-hidden="true" />
									{tab === "favorites" ? "Favorites" : "Settings"}
								</button>
							);
						})}

						<motion.div
							layout
							className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-xl bg-white shadow-sm"
							animate={{ x: activeTab === "favorites" ? 0 : "100%" }}
							transition={{ type: "spring", stiffness: 360, damping: 32 }}
						/>
					</div>

					<AnimatePresence mode="wait">
						{activeTab === "favorites" ? (
							<motion.div
								key="favorites-tab"
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.18 }}
								className="mt-3 space-y-2"
							>
								{isLoadingFavorites ? (
									<div className="space-y-2">
										{Array.from({ length: 3 }).map((_, index) => (
											<div
												key={`profile-favorite-skeleton-${index}`}
												className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
											/>
										))}
									</div>
								) : favorites.length === 0 ? (
									<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
										<Heart className="mx-auto h-5 w-5 text-slate-400" aria-hidden="true" />
										<p className="mt-2 text-sm font-semibold text-slate-700">No favorites yet</p>
										<p className="mt-1 text-xs text-slate-500">
											Save recipes from Smart Recipes and they will appear here.
										</p>
									</div>
								) : (
									<ul className="space-y-2">
										{favorites.map((recipe) => (
											<li
												key={recipe.id}
												className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.55)]"
											>
												<div className="flex items-start gap-2.5">
													{recipe.imageUrl ? (
														<Image
															src={recipe.imageUrl}
															alt={recipe.title}
															width={56}
															height={56}
															unoptimized
															className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
														/>
													) : (
														<div className="flex h-14 w-14 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500">
															<Heart className="h-4 w-4" aria-hidden="true" />
														</div>
													)}

													<div className="min-w-0 flex-1">
														<p className="truncate text-sm font-semibold text-slate-900">{recipe.title}</p>
														<p className="mt-1 text-xs text-slate-600">{getRecipePreview(recipe)}</p>
														<p className="mt-1.5 text-[11px] font-medium text-slate-400">
															Added {formatDateLabel(recipe.createdAt)}
														</p>
													</div>
												</div>
											</li>
										))}
									</ul>
								)}
							</motion.div>
						) : (
							<motion.div
								key="settings-tab"
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.18 }}
								className="mt-3 space-y-3"
							>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<div className="rounded-lg bg-amber-100 p-2 text-amber-700">
												<Bell className="h-4 w-4" aria-hidden="true" />
											</div>
											<div>
												<p className="text-sm font-semibold text-slate-800">Expiry Notifications</p>
												<p className="text-xs text-slate-500">Alerts before ingredients expire.</p>
											</div>
										</div>

										<button
											type="button"
											onClick={() => setExpiryNotifications((current) => !current)}
											role="switch"
											aria-checked={expiryNotifications}
											className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
												expiryNotifications
													? "border-emerald-300 bg-emerald-500"
													: "border-slate-300 bg-slate-300"
											}`}
										>
											<motion.span
												layout
												className="block h-5 w-5 rounded-full bg-white shadow"
												animate={{ x: expiryNotifications ? 24 : 2 }}
												transition={{ type: "spring", stiffness: 420, damping: 30 }}
											/>
										</button>
									</div>
								</div>

								<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
									<div className="flex items-center gap-2">
										<div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
											<Leaf className="h-4 w-4" aria-hidden="true" />
										</div>
										<div>
											<p className="text-sm font-semibold text-slate-800">Dietary Preferences</p>
											<p className="text-xs text-slate-500">Helps AI tune your recipe suggestions.</p>
										</div>
									</div>

									<select
										value={dietaryPreference}
										onChange={(event) => setDietaryPreference(event.target.value)}
										className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400"
									>
										{DIETARY_OPTIONS.map((option) => (
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								</div>

								<div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
									<div className="flex items-center gap-2 text-slate-600">
										<UserRound className="h-4 w-4" aria-hidden="true" />
										<p className="text-xs font-medium">Profile settings are saved on this device.</p>
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</section>
			</div>

			<BottomNav />
		</main>
	);
}
