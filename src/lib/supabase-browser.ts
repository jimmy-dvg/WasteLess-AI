// Lightweight shim to keep legacy `getSupabaseBrowserClient()` calls working
// during the migration from Supabase to JWT + Drizzle. This is intentionally
// minimal and proxies simple table operations to internal API routes.

type Session = { access_token?: string; user?: { id?: string; email?: string; user_metadata?: any } } | null;

function getTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken');
}

function buildAuthHeaders(): Record<string, string> {
  const token = getTokenFromStorage();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function createTableProxy(table: string) {
  return {
    select(..._cols: any[]): any {
      const state: { cols?: any; orderArgs?: any; limitArgs?: any } = {};

      const chainable: any = {
        order(...args: any[]) {
          state.orderArgs = args;
          return chainable;
        },
        limit(...args: any[]) {
          state.limitArgs = args;
          return chainable;
        },
        // make the object awaitable / thenable
        async then(resolve: any, reject: any) {
          try {
            const res = await fetch(`/api/${table}`, { headers: buildAuthHeaders() });
            const data = await res.json();
            const result = { data, error: res.ok ? null : data };
            return resolve ? resolve(result) : result;
          } catch (err) {
            return reject ? reject(err) : { data: null, error: err };
          }
        },
      };

      // initialize selected cols if provided
      if (_cols && _cols.length > 0) state.cols = _cols[0];
      return chainable as Promise<{ data: any; error: any }>;
    },
    async insert(payload: unknown) {
      const res = await fetch(`/api/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return { data, error: res.ok ? null : data };
    },
    async upsert(...args: any[]) {
      const payload = args[0];
      // try a dedicated upsert endpoint, fallback to POST
      const upsertUrl = `/api/${table}/upsert`;
      let res = await fetch(upsertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        res = await fetch(`/api/${table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      return { data, error: res.ok ? null : data };
    },
    delete() {
      const where: Record<string, unknown> = {};
      const chainable: any = {
        eq(col: string, val: unknown) {
          where[col] = val;
          return chainable;
        },
        async then(resolve: any, reject: any) {
          try {
            const res = await fetch(`/api/${table}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
              body: JSON.stringify(where),
            });
            const data = await res.json();
            const result = { data: res.ok ? data : null, error: res.ok ? null : data };
            return resolve ? resolve(result) : result;
          } catch (err) {
            return reject ? reject(err) : { data: null, error: err };
          }
        },
      };

      return chainable;
    },
    // basic chainable helpers used rarely in legacy code
    order() {
      return this;
    },
    limit() {
      return this;
    },
  };
}

export function getSupabaseBrowserClient() {
  return {
    from(table: string) {
      // map common table names to API routes without the namespace
      const apiTable = table.replace(/^public\./, '').trim();
      return createTableProxy(apiTable);
    },
    auth: {
      async getSession() {
        const token = getTokenFromStorage();
        const session: Session = token ? { access_token: token, user: { id: token } } : null;
        return { data: { session } };
      },
      onAuthStateChange(cb: (event: string, session: Session) => void) {
        // Immediately invoke with current session
        const token = getTokenFromStorage();
        const session = token ? { user: { id: token } } : null;
        try {
          // use setTimeout to emulate async
          setTimeout(() => cb('INITIAL', session), 0);
        } catch (e) {
          /* noop */
        }
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      async signOut() {
        if (typeof window !== 'undefined') localStorage.removeItem('authToken');
        return { error: null };
      },
    },
  };
}

export default getSupabaseBrowserClient;

// Expose as a global to support legacy modules that call the function without an import.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).getSupabaseBrowserClient = getSupabaseBrowserClient;
} catch (e) {
  // ignore in restricted runtimes
}
