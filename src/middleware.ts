import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // /api/bridge/* tem autenticação própria (x-bridge-secret), sem sessão de usuário.
  const isPublic =
    path.startsWith("/login") || path.startsWith("/api/webhook") || path.startsWith("/api/bridge");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // Guarda o destino (ex.: /inbox?telefone=55...) para voltar depois do login.
    const next = path + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (path !== "/" && next.length < 500) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
    const [tp, ts] = target.split("?");
    url.pathname = tp;
    url.search = ts ? `?${ts}` : "";
    return NextResponse.redirect(url);
  }

  // Troca obrigatória de senha: só /conta, a rota de troca, o logout (client -> /login) e a API de senha.
  if (user && !isPublic) {
    const allowed =
      path === "/conta" ||
      path.startsWith("/conta/") ||
      path === "/api/account/password";
    if (!allowed) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (prof?.must_change_password === true) {
        if (path.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Defina sua nova senha para continuar." },
            { status: 403 }
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/conta";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
