"use client";

import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/src/lib/use-auth";
import { ChefHat, Clock3, ScanLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DashboardItem = {
	id: string;
	name: string;
	quantity: number | null;
	expiryDate: string | null;
};

const TWO_DAYS_IN_MS = 48 * 60 * 60 * 1000;

function addDays(dateInput: string, days: number): string | null {
	const date = new Date(dateInput);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	date.setDate(date.getDate() + days);
	return date.toISOString();
}

function getTimeToExpiryMs(expiryDate: string | null): number | null {
	if (!expiryDate) {
		return null;
	}

	const target = new Date(expiryDate).getTime();
	if (Number.isNaN(target)) {
		return null;
	}

	return target - Date.now();
}

function formatUrgencyLabel(expiryDate: string | null): string {
	const timeToExpiry = getTimeToExpiryMs(expiryDate);
	if (timeToExpiry === null) {
		return "No expiry date";
	}

	if (timeToExpiry <= 0) {
		const hoursAgo = Math.max(1, Math.floor(Math.abs(timeToExpiry) / (60 * 60 * 1000)));
		return `Expired ${hoursAgo}h ago`;
	}

	const hoursLeft = Math.ceil(timeToExpiry / (60 * 60 * 1000));
	if (hoursLeft < 24) {
		return `Expires in ${hoursLeft}h`;
	}

	const daysLeft = Math.ceil(hoursLeft / 24);
	return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

async function loadDashboardItems(headers: Record<string, string>): Promise<DashboardItem[]> {
	const res = await fetch('/api/pantry', { headers });
	if (!res.ok) {
		const payload = await res.json().catch(() => ({}));
		throw payload?.details ?? 'Failed to load pantry items';
	}

	const pantryItems = await res.json();
	return Array.isArray(pantryItems)
		? pantryItems
			  .map((item: any) => {
				  const createdAt = item.createdAt ? String(item.createdAt) : String(item.created_at ?? "");
				  const shelfLifeDays = Number(item.shelfLifeDays ?? item.shelf_life_days ?? 0);

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
			  .filter((it: any) => it.id.length > 0 && it.name.length > 0)
			  .sort((a: any, b: any) => {
				  const aTime = getTimeToExpiryMs(a.expiryDate);
				  const bTime = getTimeToExpiryMs(b.expiryDate);

				  if (aTime === null && bTime === null) return 0;
				  if (aTime === null) return 1;
				  if (bTime === null) return -1;
				  return aTime - bTime;
			  })
		: [];
}

export default function Home() {
	const router = useRouter();
	const { session, isLoading: isAuthLoading, getAuthHeader, logout } = useAuth();
	const [items, setItems] = useState<DashboardItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		const fetchItems = async () => {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const headers = getAuthHeader();
				const result = await loadDashboardItems(headers);
				setItems(result);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to load dashboard data.";
				setErrorMessage(message);
			} finally {
				setIsLoading(false);
			}
		};

		void fetchItems();
	}, [getAuthHeader]);

	useEffect(() => {
		// `useAuth` manages session state and redirects. Nothing needed here.
	}, [session, isAuthLoading]);

	const handleLogout = async () => {
		logout();
		router.push("/login");
		router.refresh();
	};

	const totalItems = items.length;
	const expiringSoonCount = useMemo(
		() =>
			items.filter((item) => {
				const timeToExpiry = getTimeToExpiryMs(item.expiryDate);
				return timeToExpiry !== null && timeToExpiry > 0 && timeToExpiry <= TWO_DAYS_IN_MS;
			}).length,
		[items]
	);

	const urgentItems = useMemo(
		() =>
			[...items]
				.sort((a, b) => {
					const aTime = getTimeToExpiryMs(a.expiryDate);
					const bTime = getTimeToExpiryMs(b.expiryDate);

					if (aTime === null && bTime === null) {
						return 0;
					}
					if (aTime === null) {
						return 1;
					}
					if (bTime === null) {
						return -1;
					}

					return aTime - bTime;
				})
				.slice(0, 3),
		[items]
	);

	return (
		<main className="min-h-screen bg-[#f5f6f8] px-4 py-8 pb-28">
			<div className="mx-auto w-full max-w-sm space-y-6">
				<section className="rounded-3xl border border-slate-100 bg-white px-5 py-6 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)]">
					<div className="flex items-start justify-between gap-3">
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
						{isAuthLoading ? (
							<span className="text-xs text-slate-400">Checking auth...</span>
						) : session?.isAuthenticated ? (
							<button
								type="button"
								onClick={() => void handleLogout()}
								className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
							>
								Logout
							</button>
						) : (
							<Link
								href="/login"
								className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
							>
								Login
							</Link>
						)}
					</div>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Kitchen Status</h1>

					<div className="mt-5 grid grid-cols-2 gap-3">
						<div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Items</p>
							<p className="mt-2 text-3xl font-semibold text-slate-900">{isLoading ? "..." : totalItems}</p>
						</div>
						<div className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
							<p className="text-xs font-medium uppercase tracking-wide text-orange-500">Expiring Soon</p>
							<p className="mt-2 text-3xl font-semibold text-orange-700">
								{isLoading ? "..." : expiringSoonCount}
							</p>
						</div>
					</div>

					{errorMessage ? (
						<p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{errorMessage}
						</p>
					) : null}
				</section>

				<section className="rounded-3xl border border-slate-100 bg-white px-5 py-5 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)]">
					<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</h2>
					<div className="mt-4 grid grid-cols-2 gap-3">
						<Link
							href="/scan"
							className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm transition hover:bg-emerald-100"
						>
							<ScanLine className="h-6 w-6 text-emerald-700" aria-hidden="true" />
							<p className="mt-3 text-sm font-semibold text-emerald-900">Scan New Food</p>
							<p className="mt-1 text-xs text-emerald-700/80">Add items instantly</p>
						</Link>

						<Link
							href="/recipes"
							className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm transition hover:bg-amber-100"
						>
							<ChefHat className="h-6 w-6 text-amber-700" aria-hidden="true" />
							<p className="mt-3 text-sm font-semibold text-amber-900">Get Recipe Ideas</p>
							<p className="mt-1 text-xs text-amber-700/80">Cook what matters first</p>
						</Link>
					</div>
				</section>

				<section className="rounded-3xl border border-slate-100 bg-white px-5 py-5 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)]">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Most Urgent</h2>
						<Clock3 className="h-4 w-4 text-slate-400" aria-hidden="true" />
					</div>

					{isLoading ? (
						<p className="mt-4 text-sm text-slate-500">Loading urgent items...</p>
					) : urgentItems.length === 0 ? (
						<div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
							No urgent items yet. Great job staying ahead.
						</div>
					) : (
						<div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
							{urgentItems.map((item) => (
								<article
									key={item.id}
									className="min-w-[78%] snap-start rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4"
								>
									<div className="flex items-center gap-2 text-orange-600">
										<Sparkles className="h-4 w-4" aria-hidden="true" />
										<p className="text-xs font-semibold uppercase tracking-wide">Eat Soon</p>
									</div>
									<p className="mt-3 text-lg font-semibold text-slate-900">{item.name}</p>
									<p className="mt-1 text-sm text-slate-600">{formatUrgencyLabel(item.expiryDate)}</p>
									<p className="mt-2 text-xs text-slate-500">
										{item.quantity !== null ? `Qty: ${item.quantity}` : "Quantity not set"}
									</p>
								</article>
							))}
						</div>
					)}
				</section>
			</div>
			<BottomNav />
		</main>
	);
}
