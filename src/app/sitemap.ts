import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/stripe/client";

export default function sitemap(): MetadataRoute.Sitemap {
  // The budget sheet changes every poll, so the landing is "hourly".
  return [{ url: `${siteUrl()}/`, changeFrequency: "hourly", priority: 1 }];
}
