import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.dirname(scriptDirectory);
const manifestPath = path.join(workspace, "docs", "ux-ui-baseline.manifest.json");
const reportPath = path.join(workspace, "docs", "UX_UI_CSS_METRICS_BASELINE.md");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const scopes = [
  {
    id: "renderer",
    label: "Renderer CSS",
    files: [path.join(workspace, "src", "style.css"), ...listCss(path.join(workspace, "src", "styles"))]
  },
  {
    id: "prototype",
    label: "Prototype shared CSS",
    files: [path.join(workspace, "prototypes", "studio-prototype.css")]
  }
];

function listCss(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function relative(file) {
  return path.relative(workspace, file).replaceAll(path.sep, "/");
}

function readScope(scope) {
  return scope.files.filter((file) => fs.existsSync(file)).map((file) => ({ file, relative: relative(file), text: fs.readFileSync(file, "utf8") }));
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function colorTokens(text) {
  const colors = [];
  for (const line of stripComments(text).split(/\r?\n/u)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const value = line.slice(colon + 1);
    for (const match of value.matchAll(/#[0-9a-f]{3,8}\b/giu)) colors.push(match[0].toLowerCase());
  }
  return colors;
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length;
}

function selectorEntries(text) {
  const clean = stripComments(text);
  const entries = [];
  for (const match of clean.matchAll(/([^{}]+)\{/gu)) {
    const header = match[1].trim();
    if (!header || header.startsWith("@") || header.includes("@keyframes")) continue;
    for (const selector of header.split(",")) {
      const normalized = selector.replace(/\s+/gu, " ").trim();
      if (normalized && !normalized.includes(";") && !normalized.includes("=")) entries.push(normalized);
    }
  }
  return entries;
}

function metricsForScope(scope) {
  const files = readScope(scope);
  const colorFiles = new Map();
  const fontSizes = new Map([["9px", 0], ["10px", 0], ["11px", 0]]);
  const selectorFiles = new Map();
  let primaryClassUsage = 0;
  let primaryTokenUsage = 0;

  for (const entry of files) {
    const colors = colorTokens(entry.text);
    for (const color of colors) {
      if (!colorFiles.has(color)) colorFiles.set(color, new Set());
      colorFiles.get(color).add(entry.relative);
    }
    for (const size of fontSizes.keys()) fontSizes.set(size, fontSizes.get(size) + countMatches(entry.text, new RegExp(`font-size\\s*:\\s*${size.replace("px", "\\s*px")}(?![\\d.])`, "giu")));
    primaryClassUsage += countMatches(entry.text, /(?:^|[\s,>+~])\.primary(?=[\s.#:[,{])/g);
    primaryTokenUsage += countMatches(entry.text, /--primary(?:-[a-z0-9-]+)?\b/giu);
    for (const selector of new Set(selectorEntries(entry.text))) {
      if (!selectorFiles.has(selector)) selectorFiles.set(selector, new Set());
      selectorFiles.get(selector).add(entry.relative);
    }
  }

  const repeatedSelectors = [...selectorFiles.entries()]
    .filter(([, filesForSelector]) => filesForSelector.size > 1)
    .map(([selector, filesForSelector]) => ({ selector, files: [...filesForSelector].sort(), fileCount: filesForSelector.size }))
    .sort((left, right) => right.fileCount - left.fileCount || left.selector.localeCompare(right.selector));

  return {
    files,
    uniqueHex: [...colorFiles.keys()].sort(),
    colorFiles,
    fontSizes,
    primaryClassUsage,
    primaryTokenUsage,
    repeatedSelectors,
    selectorCount: selectorFiles.size
  };
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

function renderScope(scope, metrics) {
  const fileList = metrics.files.map((entry) => `\`${entry.relative}\``).join(", ");
  const repeated = metrics.repeatedSelectors.slice(0, 30).map((entry) => `| \`${entry.selector.replaceAll("|", "\\|")}\` | ${entry.fileCount} | ${entry.files.map((file) => `\`${file}\``).join(", ")} |`).join("\n");
  const sizes = [...metrics.fontSizes.entries()].map(([size, count]) => `| ${size} | ${count} |`).join("\n");
  const colors = metrics.uniqueHex.map((color) => `| \`${color}\` | ${metrics.colorFiles.get(color).size} | ${[...metrics.colorFiles.get(color)].sort().map((file) => `\`${file}\``).join(", ")} |`).join("\n");
  return `### ${scope.label}

扫描文件：${fileList || "无"}

| 指标 | 数值 |
| --- | ---: |
| unique hex | ${metrics.uniqueHex.length} |
| unique selector | ${metrics.selectorCount} |
| 跨文件重复 selector | ${metrics.repeatedSelectors.length} |
| \.primary 选择器引用 | ${metrics.primaryClassUsage} |
| \`--primary\` token 引用 | ${metrics.primaryTokenUsage} |

#### 9/10/11px 字号

| font-size | 次数 |
| --- | ---: |
${sizes}

#### unique hex 清单

| hex | 文件数 | 文件 |
| --- | ---: | --- |
${colors || "| — | 0 | — |"}

#### 跨文件重复 selector（前 30 个）

| selector | 文件数 | 文件 |
| --- | ---: | --- |
${repeated || "| — | 0 | — |"}
`;
}

const renderedScopes = scopes.map((scope) => ({ scope, metrics: metricsForScope(scope) }));
const totalFiles = renderedScopes.reduce((total, entry) => total + entry.metrics.files.length, 0);
const report = `# UX/UI CSS 债务基线

> P00 资产；由 \`node scripts/collect-ux-css-metrics.mjs\` 生成。数值是源码扫描结果，不是视觉质量结论。

| 项目 | 值 |
| --- | --- |
| 基线源 commit | \`${manifest.sourceCommit}\` |
| 当前生成 HEAD | \`${gitHead()}\` |
| 源版本 | \`${manifest.sourceVersion}\` |
| 扫描文件数 | ${totalFiles} |
| 颜色扫描规则 | 只统计 CSS declaration value 中的 3/4/6/8 位 hex；不把 selector 中的 \`#id\` 当作颜色 |
| 重复 selector 规则 | 同一 selector 出现在两个或更多 CSS 文件；只列前 30 项，完整数字可重算 |

${renderedScopes.map((entry) => renderScope(entry.scope, entry.metrics)).join("\n")}

## 解读边界

- “primary usage”同时记录 \`.primary\` class 和 \`--primary\` token 引用，避免把组件类与颜色变量混为一个指标。
- 9/10/11px 只统计 \`font-size\` 声明，不评价其它尺寸、line-height 或实际屏幕渲染结果。
- 该报告用于 P02/P03/P04/P19 的迁移前后比较；不要用它证明颜色对比度、键盘可用性或 renderer 与 prototype 已经一致。
`;

fs.writeFileSync(reportPath, report, "utf8");
console.log(reportPath);
