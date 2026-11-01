import type { ComponentChildren } from "preact";

interface Props {
  title: string;
  feedHref?: string;
  children?: ComponentChildren;
}

/** Document shell. One stylesheet, no scripts. */
export function Layout({ title, feedHref, children }: Props) {
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
        <main class="mx-auto max-w-4xl p-6 flex flex-col gap-6">{children}</main>
      </body>
    </html>
  );
}
