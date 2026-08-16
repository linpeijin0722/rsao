import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";

export async function GET() {
  const uid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!uid) return NextResponse.json({ authenticated: false }, { status: 401 });
  const { data } = await adminSupabase()
    .from("customers")
    .select("line_display_name,line_picture_url")
    .eq("line_user_id", uid)
    .single();
  return NextResponse.json({
    authenticated: true,
    displayName: data?.line_display_name || "",
    pictureUrl: data?.line_picture_url || null,
  });
}
