import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="font-display text-6xl font-bold tracking-tighter text-cyan-vivid">
          404
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.4em] text-ghost">
          Sinal perdido na transmissão
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center justify-center border border-cyan-vivid/40 px-6 py-3 text-xs uppercase tracking-[0.3em] text-cyan-vivid transition-colors hover:bg-cyan-vivid hover:text-obsidian"
        >
          Voltar ao oráculo
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Transmissão interrompida
        </h1>
        <p className="mt-2 text-sm text-ghost">
          O canal foi cortado. Tenta novamente.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="border border-cyan-vivid/50 bg-cyan-vivid/10 px-5 py-2 text-xs uppercase tracking-[0.25em] text-cyan-vivid hover:bg-cyan-vivid hover:text-obsidian transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#050506" },
      { title: "A VOZ DA VERDADE — A luz do conhecimento para um novo despertar" },
      {
        name: "description",
        content:
          "A VOZ DA VERDADE — plataforma de inteligência investigativa. Pergunta com a voz, ouve a Revelação. A luz do conhecimento para um novo despertar.",
      },
      { property: "og:title", content: "A VOZ DA VERDADE — A luz do conhecimento para um novo despertar" },
      { property: "og:description", content: "Plataforma de inteligência investigativa que transforma cada pergunta numa experiência cinematográfica e imersiva." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "A VOZ DA VERDADE — A luz do conhecimento para um novo despertar" },
      { name: "twitter:description", content: "Plataforma de inteligência investigativa que transforma cada pergunta numa experiência cinematográfica e imersiva." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/MBplqUykh5cgbCZ8cgca6jdHg2W2/social-images/social-1781891042188-22538.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/MBplqUykh5cgbCZ8cgca6jdHg2W2/social-images/social-1781891042188-22538.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Crimson+Pro:ital,wght@1,400;1,600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-obsidian text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "rgba(5,5,6,0.95)",
            border: "1px solid rgba(0,242,255,0.3)",
            color: "#e2e8f0",
            fontFamily: "Space Grotesk, sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  );
}
