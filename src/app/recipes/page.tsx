import BottomNav from "@/components/BottomNav";

export default function RecipesPage() {
	return (
		<main className="min-h-screen bg-slate-50 px-4 py-8 pb-28">
			<div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h1 className="text-2xl font-bold text-slate-900">Recipes</h1>
				<p className="mt-3 text-sm text-slate-600">
					Recipe suggestions will appear here after your pantry scan flow is connected.
				</p>
			</div>
			<BottomNav />
		</main>
	);
}