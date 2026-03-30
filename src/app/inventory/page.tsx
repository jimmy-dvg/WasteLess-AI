"use client";

import BottomNav from "@/components/BottomNav";
import { createClient } from "@supabase/supabase-js";
import {
	AlertTriangle,
	CalendarDays,
	PackageSearch,
	Search,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type FoodItem = {
	id: string;
	name: string;
	quantity: number | null;
	expiry_date: string | null;
	created_at: string | null;
	sourceTable: "pantry_items";
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getSupabaseBrowserClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

	if (!url || !publishableKey) {
		throw new Error("Missing Supabase public environment variables.");
	}

	return createClient(url, publishableKey);
}

function startOfToday(): Date {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	return now;
}

function getDaysUntilExpiry(expiryDate: string | null): number | null {
	if (!expiryDate) {
		return null;
	}

	const target = new Date(expiryDate);
	if (Number.isNaN(target.getTime())) {
		return null;
	}

	const diff = target.getTime() - startOfToday().getTime();
	return Math.ceil(diff / DAY_IN_MS);
}

function formatExpiryLabel(daysUntilExpiry: number | null): string {
	if (daysUntilExpiry === null) {
		return "No expiry date";
	}

	if (daysUntilExpiry < 0) {
		return `Expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) === 1 ? "" : "s"} ago`;
	}

	if (daysUntilExpiry === 0) {
		return "Expires today";
	}

	return `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`;
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

export default function InventoryPage() {
	const [items, setItems] = useState<FoodItem[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

	const loadItems = useCallback(async (showLoader: boolean) => {
		try {
			setErrorMessage(null);
			if (showLoader) {
				setIsLoading(true);
			} else {
				setIsRefreshing(true);
			}

			const supabase = getSupabaseBrowserClient();
			const response = await supabase
				.from("pantry_items")
				.select("id, name, shelf_life_days, created_at")
				.order("created_at", { ascending: false });

			if (response.error) {
				throw response.error;
			}

			const pantryItems = Array.isArray(response.data)
				? response.data
						.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
						.map((item) => {
							const createdAt = item.created_at ? String(item.created_at) : null;
							const shelfLifeDays = Number(item.shelf_life_days ?? 0);
							const derivedExpiryDate =
								createdAt !== null && Number.isFinite(shelfLifeDays)
									? addDays(createdAt, Math.max(0, Math.round(shelfLifeDays)))
									: null;

							return {
								id: String(item.id ?? ""),
								name: String(item.name ?? "Unnamed item"),
								quantity: null,
								expiry_date: derivedExpiryDate,
								created_at: createdAt,
								sourceTable: "pantry_items" as const,
							};
						})
						.filter((item) => item.id.length > 0)
						.sort((a, b) => {
							if (!a.expiry_date && !b.expiry_date) {
								return 0;
							}
							if (!a.expiry_date) {
								return 1;
							}
							if (!b.expiry_date) {
								return -1;
							}
							return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
						})
				: [];

			setItems(pantryItems);
		} catch (error) {
			const message = toErrorMessage(error, "Failed to load inventory.");
			setErrorMessage(message);
		} finally {
			if (showLoader) {
				setIsLoading(false);
			}
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void loadItems(true);
	}, [loadItems]);

	const filteredItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			return items;
		}

		return items.filter((item) => item.name.toLowerCase().includes(query));
	}, [items, searchQuery]);

	const handleDelete = useCallback(async (id: string) => {
		if (!id || deletingItemId) {
			return;
		}

		setDeletingItemId(id);
		setErrorMessage(null);

		try {
			const selectedItem = items.find((item) => item.id === id);
			if (!selectedItem) {
				return;
			}

			const supabase = getSupabaseBrowserClient();
			const { error } = await supabase.from(selectedItem.sourceTable).delete().eq("id", id);

			if (error) {
				throw error;
			}

			setItems((current) => current.filter((item) => item.id !== id));
		} catch (error) {
			const message = toErrorMessage(error, "Failed to delete item.");
			setErrorMessage(message);
		} finally {
			setDeletingItemId(null);
		}
	}, [deletingItemId, items]);

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_45%,_#f1f5f9_100%)] px-4 py-7 pb-28">
			<div className="mx-auto w-full max-w-sm">
				<div className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventory</h1>
							<p className="mt-1 text-sm text-slate-600">Everything in your fridge, sorted by expiry.</p>
						</div>
						<button
							type="button"
							onClick={() => void loadItems(false)}
							disabled={isLoading || isRefreshing}
							className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isRefreshing ? "Refreshing..." : "Refresh"}
						</button>
					</div>

					<div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
						<Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
						<input
							type="search"
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="Search by item name"
							className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
						/>
					</div>

					{isLoading ? <p className="mt-5 text-sm text-slate-500">Loading inventory...</p> : null}

					{errorMessage ? (
						<p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{errorMessage}
						</p>
					) : null}

					{!isLoading && !errorMessage && filteredItems.length === 0 ? (
						<div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
							<PackageSearch className="h-8 w-8 text-slate-400" aria-hidden="true" />
							<p className="mt-3 text-sm font-medium text-slate-700">No matching items found.</p>
							<p className="mt-1 text-xs text-slate-500">Try a different search or scan new food.</p>
						</div>
					) : null}

					{filteredItems.length > 0 ? (
						<ul className="mt-5 space-y-3">
							{filteredItems.map((item) => {
								const daysUntilExpiry = getDaysUntilExpiry(item.expiry_date);
								const isUrgent = daysUntilExpiry !== null && daysUntilExpiry < 3;

								return (
									<li
										key={item.id}
										className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.55)]"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<div className="flex items-center gap-2">
													<p className="text-base font-semibold text-slate-900">{item.name}</p>
													{isUrgent ? (
														<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
															<AlertTriangle className="h-3 w-3" aria-hidden="true" />
															Urgent
														</span>
													) : null}
												</div>
												<p className="mt-1 text-xs text-slate-600">
													{item.quantity !== null && item.quantity > 0
														? `Qty: ${item.quantity}`
														: "Quantity not set"}
												</p>
											</div>

											<button
												type="button"
												onClick={() => void handleDelete(item.id)}
												disabled={deletingItemId === item.id}
												className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
												aria-label={`Delete ${item.name}`}
											>
												<Trash2 className="h-4 w-4" aria-hidden="true" />
											</button>
										</div>

										<div className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
											<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
											<span>{formatExpiryLabel(daysUntilExpiry)}</span>
										</div>
									</li>
								);
							})}
						</ul>
					) : null}
				</div>
			</div>
			<BottomNav />
		</main>
	);
}