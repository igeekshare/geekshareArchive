import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

export async function middleware(request: NextRequest) {
  const session = await verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  const isLoginPage = request.nextUrl.pathname === "/admin/login";

  if (isLoginPage && session) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (!isLoginPage && !session) {
    const response = NextResponse.redirect(
      new URL("/admin/login", request.url),
    );
    response.cookies.delete(ADMIN_SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
