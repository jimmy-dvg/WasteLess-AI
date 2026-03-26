import BottomNav from "@/components/BottomNav";
import Link from "next/link";

export default function Home() {
	return (
		<main className="min-h-screen bg-slate-50 px-4 py-8 pb-28">
			<div className="mx-auto w-full max-w-sm">
				<h1 className="text-3xl font-bold text-slate-900">Wastless AI</h1>

				<Link
					href="/scan"
					className="mt-6 block w-full rounded-lg bg-green-600 px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-green-700"
				>
					Scan Food
				</Link>

				<section className="mt-8 rounded-lg bg-white p-4 shadow-sm">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
						Pantry Status
					</h2>
					<ul className="mt-4 space-y-3">
						<li className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2">
							<span className="font-medium text-slate-900">Milk</span>
							<span className="text-sm font-medium text-red-600">expiring today</span>
						</li>
						<li className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2">
							<span className="font-medium text-slate-900">Eggs</span>
							<span className="text-sm font-medium text-orange-600">expiring in 2 days</span>
						</li>
						<li className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2">
							<span className="font-medium text-slate-900">Bread</span>
							<span className="text-sm font-medium text-green-600">fresh</span>
						</li>
					</ul>
				</section>
			</div>
			<BottomNav />
		</main>
	);
}
