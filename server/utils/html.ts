import type { H3Event } from "h3";
import { setResponseHeader } from "h3";
import type { VNode } from "preact";
import { renderToStaticMarkup } from "preact-render-to-string";

/** Render a component tree to a static HTML document. No client runtime. */
export function html(event: H3Event, tree: VNode): string {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");
  return "<!doctype html>" + renderToStaticMarkup(tree);
}
