import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/constants/site.config";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_CONFIG.url;

  // Static routes
  const routes = [
    "",
    "/flashcard",
    "/grammar",
    "/speaking-upload",
    "/classes",
    "/terms",
    "/privacy",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  return routes;
}

