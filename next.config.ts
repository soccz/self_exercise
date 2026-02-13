import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const repositoryName = repository.split("/")[1] ?? "";
const isUserOrOrgPages = repositoryName.endsWith(".github.io");

const shouldUseBasePath =
  isGithubActions && repositoryName.length > 0 && !isUserOrOrgPages;
const basePath = shouldUseBasePath ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  // output: "export", // Disabled for Vercel API Routes
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
