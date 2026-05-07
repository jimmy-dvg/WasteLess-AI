"use client";

import { useAuth } from "@/src/lib/use-auth";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function AdminDashboardPage() {
	const router = useRouter();
	const { getAuthHeader } = useAuth();
	const [isCheckingAccess, setIsCheckingAccess] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		const checkAccess = async () => {
			try {
					const res = await fetch('/api/admin/role', { headers: getAuthHeader() as HeadersInit });
					if (!res.ok) {
						router.replace('/');
						return;
					}
					const payload = await res.json();
					const role = payload?.role ?? 'user';
					if (role !== 'admin') {
						router.replace('/');
						return;
					}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to validate admin access.";
				setErrorMessage(message);
				router.replace("/");
			} finally {
				setIsCheckingAccess(false);
			}
		};

		void checkAccess();
	}, [router, getAuthHeader]);

	if (isCheckingAccess) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
				<div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
					Checking admin access...
				</div>
			</main>
		);
	}

	if (errorMessage) {
		return null;
	}

	return (
		<main className="min-h-screen bg-slate-50 px-4 py-10">
			<div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
					<ShieldCheck className="h-4 w-4" aria-hidden="true" />
					Admin Only
				</div>
				<h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
				<p className="mt-2 text-sm text-slate-600">
					Welcome. You are signed in as an administrator.
				</p>
			</div>
		</main>
	);
}
