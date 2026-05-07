import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDrizzleClient } from "@/src/lib/drizzle-client";
import { profiles } from "@/src/lib/drizzle-schema";
import { getAuthenticatedUser } from "@/src/lib/jwt-auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDrizzleClient();
    const rows = await db.select().from(profiles).where(eq(profiles.id, user.userId)).limit(1);
    const role = rows[0]?.role ?? 'user';
    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to determine role.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
