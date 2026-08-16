import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/?payment=returned", request.url), 303);
}
