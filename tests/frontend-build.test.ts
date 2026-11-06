import path from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";

interface BuiltChunk {
  file: string;
  size: number;
  entry: boolean;
  imports: string[];
  modules: string[];
}

describe("frontend production module boundaries", () => {
  it.each(["vite.config.ts", "vite.web.config.ts"])(
    "shares canonical modules and keeps optional locales lazy (%s)",
    async (configFile) => {
      const chunks: BuiltChunk[] = [];
      // Inspect real minified output in memory; never clean/write dist while
      // the rest of the test suite may be reading bundled assets.
      await build({
        configFile: path.resolve(configFile),
        logLevel: "silent",
        build: { write: false },
        plugins: [{
          name: "inspect-production-boundaries",
          generateBundle(_options, bundle) {
            for (const chunk of Object.values(bundle)) {
              if (chunk.type !== "chunk") continue;
              chunks.push({
                file: chunk.fileName,
                size: Buffer.byteLength(chunk.code),
                entry: chunk.isEntry,
                imports: chunk.imports,
                modules: Object.keys(chunk.modules).map((id) => id.replaceAll("\\", "/"))
              });
            }
          }
        }]
      });
      const owners = (suffix: string) => chunks.filter((c) => c.modules.some((id) => id.endsWith(suffix)));
      const reachable = (file: string, visited = new Set<string>()): Set<string> => {
        if (visited.has(file)) return visited;
        visited.add(file);
        for (const dependency of chunks.find((c) => c.file === file)?.imports ?? []) {
          reachable(dependency, visited);
        }
        return visited;
      };
      const entries = chunks.filter((c) => c.entry);
      expect(entries).toHaveLength(1);
      const sourceIds = chunks.flatMap((c) => c.modules.filter((id) => id.includes("/src/")));
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
      expect(owners("/src/core/i18n-keys.ts")).toHaveLength(1);
      expect(owners("/src/core/i18n.ts")).toHaveLength(1);
      const initial = reachable(entries[0]!.file);
      const keys = owners("/src/core/i18n-keys.ts")[0]!;
      for (const locale of ["zh-CN", "en-US", "zh-TW"]) {
        const catalogs = owners(`/src/core/locales/${locale}.ts`);
        expect(catalogs).toHaveLength(1);
        expect(initial.has(catalogs[0]!.file)).toBe(locale === "zh-CN");
        // Catalog initialization reads the shared keys. The keys must not
        // import a catalog back, which would introduce an initialization cycle.
        expect(reachable(keys.file).has(catalogs[0]!.file)).toBe(false);
      }
      expect(chunks.filter((c) => c.size > 500_000).map((c) => ({ file: c.file, bytes: c.size }))).toEqual([]);
    },
    20_000
  );
});
