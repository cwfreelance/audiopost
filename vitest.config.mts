import { defineConfig } from "vitest/config";

// Resolve the `@/` import alias from tsconfig.json.
export default defineConfig({ resolve: { tsconfigPaths: true } });
