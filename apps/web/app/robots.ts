import type { MetadataRoute } from "next";

/** Only the marketing landing page may be indexed. Party rooms and APIs never are. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: ["/r/", "/api/", "/create", "/join"] }],
  };
}
