import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/stripe/client";

// Rendered per request: the site URL is a runtime env var, and at Docker
// build time there is none — a prerender would bake in localhost.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  // The budget sheet changes every poll, so the landing is "hourly".
  return [
    { url: `${siteUrl()}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl()}/example`, changeFrequency: "hourly", priority: 0.8 },
  ];
}
