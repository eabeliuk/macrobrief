import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/stripe/client";

/** The landing is public; the app, the API, the tracker and the sign-in page are not for crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/r/", "/login"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
