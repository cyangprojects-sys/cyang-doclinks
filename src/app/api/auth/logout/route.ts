import { NextResponse } from "next/server";

const COOKIE = "cy_doc_session";

export async function POST(req: Request) {
  const url = new URL(req.url);

  const res = NextResponse.redirect(new URL("/", url), { status: 303 });

  res.cookies.set({
    name: COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
