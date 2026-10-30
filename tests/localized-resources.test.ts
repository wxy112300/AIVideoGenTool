import { describe, expect, it } from "vitest";

const resources = import.meta.glob<Record<string, unknown>>([
  "../src/core/catalog/models/**/locale.*.ts",
  "../src/core/prompts/**/locale.*.ts"
], { eager: true });

function messages(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    Object.entries(messages(child, `${prefix}.${key.replace(/^locale(?:ZhCN|ZhTW|EnUS)$/, "locale")}`))
  ));
}

describe("model and prompt interface translations", () => {
  for (const [filename, resource] of Object.entries(resources).filter(([name]) => name.includes(".zh-CN."))) {
    it(`preserves labels and message parameters for ${filename}`, () => {
      const source = messages(resource);
      const params = (text: string) => [...new Set(text.match(/\{[A-Za-z0-9_.-]+\}/gu) ?? [])].sort();
      for (const locale of ["en-US", "zh-TW"]) {
        const translated = messages(resources[filename.replace(".zh-CN.", `.${locale}.`)]);
        expect(Object.keys(translated).sort(), locale).toEqual(Object.keys(source).sort());
        for (const [key, value] of Object.entries(source)) {
          expect.soft(translated[key]?.trim(), `${locale}: ${key}`).toBeTruthy();
          expect.soft(params(translated[key] ?? ""), `${locale}: ${key}`).toEqual(params(value));
        }
      }
    });
  }
});
