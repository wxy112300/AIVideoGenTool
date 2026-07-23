import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(scriptDirectory);
const prototypeDirectory = path.join(projectDirectory, 'prototypes');
const outputDirectory = path.join(prototypeDirectory, 'preview');
const baseStylesheetPath =
  'C:\\Users\\Alice\\.codex\\plugins\\cache\\openai-bundled\\visualize\\1.0.14\\skills\\visualize\\assets\\visualize.css';

const pages = [
  ['create.html', '创建'],
  ['queue.html', '队列'],
  ['history.html', '历史'],
  ['history-detail.html', '视频详情'],
  ['upscale.html', '提升分辨率'],
  ['settings.html', '设置']
];

const baseStylesheet = fs.readFileSync(baseStylesheetPath, 'utf8');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.copyFileSync(
  path.join(prototypeDirectory, 'upscale-dialog.js'),
  path.join(outputDirectory, 'upscale-dialog.js')
);

for (const [filename, title] of pages) {
  const fragmentPath = path.join(prototypeDirectory, filename);
  const outputPath = path.join(outputDirectory, filename);
  const fragment = fs.readFileSync(fragmentPath, 'utf8');
  const document = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Local Video Studio · ${title}</title>
  <style>
${baseStylesheet}
    html { background: var(--background); }
    body {
      margin: 0;
      padding: clamp(14px, 3vw, 30px);
      background: var(--background);
      color: var(--foreground);
    }
    body > div[id] {
      width: min(100%, 1180px);
      margin-inline: auto;
    }
    a.btn { text-decoration: none; }
    .nav a.btn[aria-current="page"] {
      color: var(--primary-foreground);
      background: var(--primary);
    }
  </style>
</head>
<body>
${fragment}
  <script src="./upscale-dialog.js"></script>
  <script src="https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js"></script>
  <script>
    globalThis.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
  </script>
</body>
</html>
`;
  fs.writeFileSync(outputPath, document, 'utf8');
  console.log(outputPath);
}
