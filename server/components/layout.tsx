import type { ComponentChildren } from "preact";

interface Props {
  title: string;
  feedHref?: string;
  /** Room for a table. Reading pages keep the narrow column. */
  wide?: boolean;
  children?: ComponentChildren;
}

/** Document shell. One stylesheet, no scripts. */
export function Layout({ title, feedHref, wide, children }: Props) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
        <link rel="stylesheet" href="/app.css" />
        {feedHref ? (
          <link
            rel="alternate"
            type="application/atom+xml"
            title="delegator-report crashes"
            href={feedHref}
          />
        ) : null}
      </head>
      <body class="min-h-screen antialiased">
        <main class={`mx-auto flex flex-col gap-6 p-6 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
          {children}
        </main>
      </body>
    </html>
  );
}
