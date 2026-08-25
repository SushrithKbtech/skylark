import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up into the home directory.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
