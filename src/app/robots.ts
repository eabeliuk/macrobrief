import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/stripe/client";

// Rendered per request: the site URL is a runtime env var, and at Docker
// build time there is none — a prerender would bake in localhost.
export const dynamic = "force-dynamic";

/** The landing is public; the app, the API, the tracker and the sign-in page are not for crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/r/", "/l/", "/login"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
