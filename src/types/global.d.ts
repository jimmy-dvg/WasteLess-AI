declare function getSupabaseBrowserClient(): {
	from: (table: string) => any;
	auth: {
		getSession: () => Promise<{ data: { session: any } }>;
		onAuthStateChange: (cb: (event: string, session: any) => void) => { data: { subscription: { unsubscribe: () => void } } };
		signOut: () => Promise<any>;
	};
};

