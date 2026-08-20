# UX/UI CSS 债务基线

> P00 资产；由 `node scripts/collect-ux-css-metrics.mjs` 生成。数值是源码扫描结果，不是视觉质量结论。

| 项目 | 值 |
| --- | --- |
| 基线源 commit | `f4653727004e6d4cc2be1ceb7d8b4d0e749bf560` |
| 当前生成 HEAD | `f4653727004e6d4cc2be1ceb7d8b4d0e749bf560` |
| 源版本 | `0.30.0` |
| 扫描文件数 | 13 |
| 颜色扫描规则 | 只统计 CSS declaration value 中的 3/4/6/8 位 hex；不把 selector 中的 `#id` 当作颜色 |
| 重复 selector 规则 | 同一 selector 出现在两个或更多 CSS 文件；只列前 30 项，完整数字可重算 |

### Renderer CSS

扫描文件：`src/style.css`, `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/03-acceleration.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css`, `src/styles/06-settings-layout.css`, `src/styles/07-create-composer.css`, `src/styles/08-prompt-helper.css`, `src/styles/09-create-header.css`, `src/styles/10-final-refinements.css`, `src/styles/11-history-curation.css`

| 指标 | 数值 |
| --- | ---: |
| unique hex | 300 |
| unique selector | 1383 |
| 跨文件重复 selector | 196 |
| .primary 选择器引用 | 11 |
| `--primary` token 引用 | 80 |

#### 9/10/11px 字号

| font-size | 次数 |
| --- | ---: |
| 9px | 9 |
| 10px | 64 |
| 11px | 99 |

#### unique hex 清单

| hex | 文件数 | 文件 |
| --- | ---: | --- |
| `#050c16` | 1 | `src/styles/02-visual-refresh.css` |
| `#07090c` | 1 | `src/styles/05-density-refinement.css` |
| `#07101e` | 1 | `src/styles/02-visual-refresh.css` |
| `#07111d` | 1 | `src/styles/01-foundation.css` |
| `#07111f` | 1 | `src/styles/02-visual-refresh.css` |
| `#080a0d` | 1 | `src/styles/02-visual-refresh.css` |
| `#08111c` | 1 | `src/styles/01-foundation.css` |
| `#090a0c` | 1 | `src/styles/01-foundation.css` |
| `#090c10` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/07-create-composer.css` |
| `#090c11` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#090d12` | 1 | `src/styles/06-settings-layout.css` |
| `#09111e` | 1 | `src/styles/02-visual-refresh.css` |
| `#0a0d12` | 2 | `src/styles/10-final-refinements.css`, `src/styles/11-history-curation.css` |
| `#0b0d12` | 1 | `src/styles/02-visual-refresh.css` |
| `#0c0d0f` | 1 | `src/styles/01-foundation.css` |
| `#0c0f14` | 1 | `src/styles/02-visual-refresh.css` |
| `#0c1016` | 1 | `src/styles/02-visual-refresh.css` |
| `#0c1118` | 1 | `src/styles/11-history-curation.css` |
| `#0c1625` | 1 | `src/styles/03-acceleration.css` |
| `#0c291c` | 1 | `src/styles/03-acceleration.css` |
| `#0d1014` | 1 | `src/styles/10-final-refinements.css` |
| `#0d1118` | 1 | `src/styles/01-foundation.css` |
| `#0e1218` | 1 | `src/styles/02-visual-refresh.css` |
| `#0e1319` | 1 | `src/styles/10-final-refinements.css` |
| `#0f1319` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#0f141b` | 1 | `src/styles/05-density-refinement.css` |
| `#10141a` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#10151b` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/03-acceleration.css` |
| `#10151c` | 1 | `src/styles/10-final-refinements.css` |
| `#10151d` | 2 | `src/styles/06-settings-layout.css`, `src/styles/11-history-curation.css` |
| `#10233d` | 1 | `src/styles/03-acceleration.css` |
| `#111214` | 1 | `src/styles/01-foundation.css` |
| `#111317` | 1 | `src/styles/01-foundation.css` |
| `#11161d` | 3 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css` |
| `#111822` | 1 | `src/styles/05-density-refinement.css` |
| `#121315` | 1 | `src/styles/01-foundation.css` |
| `#121418` | 1 | `src/styles/01-foundation.css` |
| `#141619` | 1 | `src/styles/01-foundation.css` |
| `#141820` | 1 | `src/styles/02-visual-refresh.css` |
| `#141a22` | 1 | `src/styles/05-density-refinement.css` |
| `#15171a` | 1 | `src/styles/01-foundation.css` |
| `#15191f` | 1 | `src/styles/01-foundation.css` |
| `#151a21` | 1 | `src/styles/10-final-refinements.css` |
| `#151a22` | 1 | `src/styles/05-density-refinement.css` |
| `#151b24` | 1 | `src/styles/02-visual-refresh.css` |
| `#151b25` | 1 | `src/styles/02-visual-refresh.css` |
| `#151c26` | 1 | `src/styles/05-density-refinement.css` |
| `#151d28` | 2 | `src/styles/01-foundation.css`, `src/styles/07-create-composer.css` |
| `#161c24` | 1 | `src/styles/10-final-refinements.css` |
| `#181b20` | 1 | `src/styles/01-foundation.css` |
| `#1b202a` | 1 | `src/styles/02-visual-refresh.css` |
| `#1b212b` | 1 | `src/styles/02-visual-refresh.css` |
| `#1c1e22` | 1 | `src/styles/01-foundation.css` |
| `#1d232d` | 1 | `src/styles/02-visual-refresh.css` |
| `#1d2430` | 1 | `src/styles/02-visual-refresh.css` |
| `#1d2b3e` | 1 | `src/styles/10-final-refinements.css` |
| `#202631` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#202632` | 1 | `src/styles/02-visual-refresh.css` |
| `#202733` | 1 | `src/styles/05-density-refinement.css` |
| `#20324a` | 1 | `src/styles/01-foundation.css` |
| `#24272c` | 1 | `src/styles/01-foundation.css` |
| `#242a34` | 1 | `src/styles/01-foundation.css` |
| `#243145` | 1 | `src/styles/01-foundation.css` |
| `#252c38` | 1 | `src/styles/02-visual-refresh.css` |
| `#252d39` | 1 | `src/styles/05-density-refinement.css` |
| `#272e3a` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#292f39` | 1 | `src/styles/02-visual-refresh.css` |
| `#29303a` | 1 | `src/styles/02-visual-refresh.css` |
| `#29303c` | 1 | `src/styles/02-visual-refresh.css` |
| `#29313d` | 1 | `src/styles/10-final-refinements.css` |
| `#2b1b05` | 1 | `src/styles/03-acceleration.css` |
| `#2b323d` | 1 | `src/styles/01-foundation.css` |
| `#30343a` | 1 | `src/styles/01-foundation.css` |
| `#303846` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#303946` | 1 | `src/styles/10-final-refinements.css` |
| `#303948` | 1 | `src/styles/02-visual-refresh.css` |
| `#303a48` | 1 | `src/styles/10-final-refinements.css` |
| `#321015` | 1 | `src/styles/03-acceleration.css` |
| `#33373e` | 1 | `src/styles/01-foundation.css` |
| `#353e4c` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#35404e` | 1 | `src/styles/10-final-refinements.css` |
| `#354257` | 1 | `src/styles/10-final-refinements.css` |
| `#363e49` | 1 | `src/styles/01-foundation.css` |
| `#38404c` | 1 | `src/styles/11-history-curation.css` |
| `#394454` | 1 | `src/styles/02-visual-refresh.css` |
| `#3a4555` | 1 | `src/styles/02-visual-refresh.css` |
| `#414a58` | 1 | `src/styles/01-foundation.css` |
| `#414c5d` | 1 | `src/styles/02-visual-refresh.css` |
| `#4198ff` | 1 | `src/styles/01-foundation.css` |
| `#45536a` | 1 | `src/styles/02-visual-refresh.css` |
| `#465265` | 1 | `src/styles/05-density-refinement.css` |
| `#46566d` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#466184` | 1 | `src/styles/10-final-refinements.css` |
| `#4b515b` | 2 | `src/styles/01-foundation.css`, `src/styles/10-final-refinements.css` |
| `#4f91ff` | 1 | `src/styles/05-density-refinement.css` |
| `#505660` | 1 | `src/styles/01-foundation.css` |
| `#50617a` | 1 | `src/styles/01-foundation.css` |
| `#526073` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#556276` | 1 | `src/styles/01-foundation.css` |
| `#5f9bff` | 1 | `src/styles/05-density-refinement.css` |
| `#62d69b` | 1 | `src/styles/10-final-refinements.css` |
| `#62d99d` | 1 | `src/styles/03-acceleration.css` |
| `#667285` | 1 | `src/styles/11-history-curation.css` |
| `#679dff` | 1 | `src/styles/02-visual-refresh.css` |
| `#699eff` | 1 | `src/styles/02-visual-refresh.css` |
| `#6b96da` | 1 | `src/styles/02-visual-refresh.css` |
| `#6ca1ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#6d9ce8` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#6ed59e` | 1 | `src/styles/10-final-refinements.css` |
| `#6fe6a7` | 1 | `src/styles/10-final-refinements.css` |
| `#727d8c` | 1 | `src/styles/01-foundation.css` |
| `#72d6a0` | 1 | `src/styles/02-visual-refresh.css` |
| `#75d69c` | 1 | `src/styles/01-foundation.css` |
| `#76a8fb` | 1 | `src/styles/02-visual-refresh.css` |
| `#77869a` | 1 | `src/styles/07-create-composer.css` |
| `#7cb8ff` | 1 | `src/styles/01-foundation.css` |
| `#7f8998` | 1 | `src/styles/01-foundation.css` |
| `#7f8b9c` | 1 | `src/styles/10-final-refinements.css` |
| `#7f8ca0` | 1 | `src/styles/02-visual-refresh.css` |
| `#7f8da0` | 3 | `src/styles/01-foundation.css`, `src/styles/07-create-composer.css`, `src/styles/10-final-refinements.css` |
| `#7f8da1` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#7faef2` | 1 | `src/styles/01-foundation.css` |
| `#8290a3` | 1 | `src/styles/01-foundation.css` |
| `#8391a3` | 1 | `src/styles/02-visual-refresh.css` |
| `#8391a4` | 1 | `src/styles/06-settings-layout.css` |
| `#83b6ff` | 1 | `src/styles/03-acceleration.css` |
| `#8490a0` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#8491a3` | 1 | `src/styles/10-final-refinements.css` |
| `#8492a5` | 1 | `src/styles/07-create-composer.css` |
| `#84b6ff` | 1 | `src/styles/10-final-refinements.css` |
| `#8593a5` | 1 | `src/styles/02-visual-refresh.css` |
| `#8593a6` | 1 | `src/styles/02-visual-refresh.css` |
| `#8694a7` | 1 | `src/styles/05-density-refinement.css` |
| `#8792a2` | 1 | `src/styles/05-density-refinement.css` |
| `#8993a2` | 1 | `src/styles/02-visual-refresh.css` |
| `#8995a7` | 1 | `src/styles/10-final-refinements.css` |
| `#8996a8` | 2 | `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css` |
| `#8998ad` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/08-prompt-helper.css` |
| `#8ab4ff` | 3 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css` |
| `#8bc5ff` | 1 | `src/styles/01-foundation.css` |
| `#8d97a5` | 1 | `src/styles/01-foundation.css` |
| `#8d9bad` | 1 | `src/styles/07-create-composer.css` |
| `#8d9bb1` | 1 | `src/styles/07-create-composer.css` |
| `#8d9caf` | 1 | `src/styles/06-settings-layout.css` |
| `#8db8ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#8e9caf` | 1 | `src/styles/02-visual-refresh.css` |
| `#8ed0ae` | 1 | `src/styles/02-visual-refresh.css` |
| `#8f99a8` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#8f9bab` | 1 | `src/styles/03-acceleration.css` |
| `#8f9cad` | 1 | `src/styles/10-final-refinements.css` |
| `#8f9db1` | 1 | `src/styles/02-visual-refresh.css` |
| `#8fa8ca` | 1 | `src/styles/10-final-refinements.css` |
| `#8fb7fb` | 1 | `src/styles/02-visual-refresh.css` |
| `#8fbbff` | 1 | `src/styles/07-create-composer.css` |
| `#90a9c8` | 1 | `src/styles/10-final-refinements.css` |
| `#91a6c5` | 1 | `src/styles/03-acceleration.css` |
| `#91b8ed` | 1 | `src/styles/05-density-refinement.css` |
| `#929cab` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#929eae` | 1 | `src/styles/02-visual-refresh.css` |
| `#929fb1` | 1 | `src/styles/02-visual-refresh.css` |
| `#9ac4ff` | 1 | `src/styles/03-acceleration.css` |
| `#9ba8b9` | 1 | `src/styles/07-create-composer.css` |
| `#9baabd` | 1 | `src/styles/02-visual-refresh.css` |
| `#9ca2ad` | 1 | `src/styles/01-foundation.css` |
| `#9ca6b6` | 1 | `src/styles/02-visual-refresh.css` |
| `#9cabc0` | 1 | `src/styles/02-visual-refresh.css` |
| `#9cbbe4` | 1 | `src/styles/10-final-refinements.css` |
| `#9cc1ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#9db9e7` | 1 | `src/styles/07-create-composer.css` |
| `#9ea8b7` | 1 | `src/styles/02-visual-refresh.css` |
| `#9ee5c4` | 1 | `src/styles/01-foundation.css` |
| `#9fbfff` | 1 | `src/styles/02-visual-refresh.css` |
| `#9fc2ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#a3c3ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#a6c5ed` | 1 | `src/styles/10-final-refinements.css` |
| `#a6c7ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#a7c7ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#a8cbff` | 1 | `src/styles/01-foundation.css` |
| `#a9c9ff` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/06-settings-layout.css`, `src/styles/10-final-refinements.css` |
| `#a9caff` | 1 | `src/styles/07-create-composer.css` |
| `#aeb7c4` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#aeb9c8` | 1 | `src/styles/10-final-refinements.css` |
| `#aebbd0` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#afd0ff` | 1 | `src/styles/01-foundation.css` |
| `#b0ceff` | 1 | `src/styles/02-visual-refresh.css` |
| `#b4bfce` | 1 | `src/styles/01-foundation.css` |
| `#b7d2ff` | 1 | `src/styles/01-foundation.css` |
| `#b8aa91` | 1 | `src/styles/02-visual-refresh.css` |
| `#b8c1ce` | 2 | `src/styles/03-acceleration.css`, `src/styles/10-final-refinements.css` |
| `#b8cbea` | 1 | `src/styles/06-settings-layout.css` |
| `#b94349` | 1 | `src/styles/05-density-refinement.css` |
| `#b9c7d8` | 2 | `src/styles/01-foundation.css`, `src/styles/06-settings-layout.css` |
| `#b9c7d9` | 1 | `src/styles/02-visual-refresh.css` |
| `#b9c9df` | 1 | `src/styles/01-foundation.css` |
| `#b9d2f5` | 1 | `src/styles/01-foundation.css` |
| `#b9d7ff` | 2 | `src/styles/01-foundation.css`, `src/styles/10-final-refinements.css` |
| `#b9d8ff` | 1 | `src/styles/01-foundation.css` |
| `#bbc6d4` | 1 | `src/styles/01-foundation.css` |
| `#bcd4ff` | 1 | `src/styles/03-acceleration.css` |
| `#bcd5ff` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#bdc6d2` | 1 | `src/styles/02-visual-refresh.css` |
| `#c3cad5` | 1 | `src/styles/02-visual-refresh.css` |
| `#c4c9d1` | 1 | `src/styles/01-foundation.css` |
| `#c5ccd6` | 1 | `src/styles/02-visual-refresh.css` |
| `#c6d8f5` | 1 | `src/styles/01-foundation.css` |
| `#c74e54` | 1 | `src/styles/05-density-refinement.css` |
| `#c7d3e2` | 1 | `src/styles/07-create-composer.css` |
| `#c8d8ee` | 1 | `src/styles/01-foundation.css` |
| `#c9d0da` | 1 | `src/styles/02-visual-refresh.css` |
| `#c9d9f1` | 1 | `src/styles/02-visual-refresh.css` |
| `#cbd3df` | 1 | `src/styles/11-history-curation.css` |
| `#cbd4e0` | 1 | `src/styles/03-acceleration.css` |
| `#d6dce5` | 1 | `src/styles/02-visual-refresh.css` |
| `#d6e1ef` | 1 | `src/styles/10-final-refinements.css` |
| `#d7b879` | 1 | `src/styles/02-visual-refresh.css` |
| `#d85d62` | 1 | `src/styles/05-density-refinement.css` |
| `#d8c3c6` | 1 | `src/styles/01-foundation.css` |
| `#d8dee7` | 1 | `src/styles/02-visual-refresh.css` |
| `#d8e8ff` | 1 | `src/styles/05-density-refinement.css` |
| `#d94850` | 1 | `src/styles/10-final-refinements.css` |
| `#d99a91` | 1 | `src/styles/01-foundation.css` |
| `#d9bd89` | 1 | `src/styles/07-create-composer.css` |
| `#d9e5f4` | 1 | `src/styles/06-settings-layout.css` |
| `#d9e8fb` | 1 | `src/styles/05-density-refinement.css` |
| `#dbe5f1` | 1 | `src/styles/10-final-refinements.css` |
| `#dbe5f2` | 1 | `src/styles/05-density-refinement.css` |
| `#dbe6f5` | 1 | `src/styles/07-create-composer.css` |
| `#dbe7f7` | 1 | `src/styles/03-acceleration.css` |
| `#dbe8fa` | 2 | `src/styles/01-foundation.css`, `src/styles/07-create-composer.css` |
| `#dbe8ff` | 1 | `src/styles/07-create-composer.css` |
| `#dbe9ff` | 3 | `src/styles/02-visual-refresh.css`, `src/styles/08-prompt-helper.css`, `src/styles/10-final-refinements.css` |
| `#dce0e6` | 1 | `src/styles/01-foundation.css` |
| `#dce4ef` | 2 | `src/styles/05-density-refinement.css`, `src/styles/06-settings-layout.css` |
| `#dce7f5` | 2 | `src/styles/06-settings-layout.css`, `src/styles/07-create-composer.css` |
| `#dce7f6` | 1 | `src/styles/02-visual-refresh.css` |
| `#dce7f7` | 1 | `src/styles/07-create-composer.css` |
| `#dce9ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#dceaff` | 1 | `src/styles/01-foundation.css` |
| `#e1e9f4` | 1 | `src/styles/10-final-refinements.css` |
| `#e2e6eb` | 1 | `src/styles/01-foundation.css` |
| `#e2e7ef` | 2 | `src/styles/01-foundation.css`, `src/styles/04-history-stage.css` |
| `#e36a70` | 1 | `src/styles/05-density-refinement.css` |
| `#e3e8ef` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `#e3e9f2` | 1 | `src/styles/03-acceleration.css` |
| `#e3fff1` | 1 | `src/styles/03-acceleration.css` |
| `#e4b76b` | 2 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css` |
| `#e4e9f0` | 1 | `src/styles/02-visual-refresh.css` |
| `#e5eaf2` | 1 | `src/styles/02-visual-refresh.css` |
| `#e5ebf5` | 1 | `src/styles/05-density-refinement.css` |
| `#e6c16e` | 1 | `src/styles/06-settings-layout.css` |
| `#e6edf7` | 2 | `src/styles/01-foundation.css`, `src/styles/10-final-refinements.css` |
| `#e7ebf2` | 1 | `src/styles/02-visual-refresh.css` |
| `#e7edf6` | 1 | `src/styles/10-final-refinements.css` |
| `#e8edf5` | 1 | `src/styles/11-history-curation.css` |
| `#e8f1ff` | 1 | `src/styles/03-acceleration.css` |
| `#e9edf3` | 1 | `src/styles/01-foundation.css` |
| `#e9f3ff` | 1 | `src/styles/01-foundation.css` |
| `#eaf3ff` | 1 | `src/styles/05-density-refinement.css` |
| `#ecf5ff` | 1 | `src/styles/01-foundation.css` |
| `#edf1f7` | 1 | `src/styles/02-visual-refresh.css` |
| `#edf4ff` | 1 | `src/styles/01-foundation.css` |
| `#edf5ff` | 1 | `src/styles/07-create-composer.css` |
| `#eef2f8` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#eef3fb` | 1 | `src/styles/11-history-curation.css` |
| `#eef4fc` | 1 | `src/styles/05-density-refinement.css` |
| `#eef5ff` | 3 | `src/styles/01-foundation.css`, `src/styles/03-acceleration.css`, `src/styles/10-final-refinements.css` |
| `#ef6c7b` | 1 | `src/styles/11-history-curation.css` |
| `#ef6d7a` | 1 | `src/styles/01-foundation.css` |
| `#efa4ad` | 1 | `src/styles/07-create-composer.css` |
| `#efbd65` | 1 | `src/styles/10-final-refinements.css` |
| `#f06b78` | 1 | `src/styles/11-history-curation.css` |
| `#f0f6ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#f1c77e` | 1 | `src/styles/02-visual-refresh.css` |
| `#f1cb89` | 2 | `src/styles/01-foundation.css`, `src/styles/10-final-refinements.css` |
| `#f3f7ff` | 1 | `src/styles/02-visual-refresh.css` |
| `#f4bd6a` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/03-acceleration.css` |
| `#f4f6fa` | 1 | `src/styles/01-foundation.css` |
| `#f4f7fb` | 1 | `src/styles/05-density-refinement.css` |
| `#f4f8ff` | 2 | `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css` |
| `#f5f7fb` | 1 | `src/styles/02-visual-refresh.css` |
| `#f6bd4f` | 1 | `src/styles/11-history-curation.css` |
| `#f7b955` | 1 | `src/styles/10-final-refinements.css` |
| `#f7f7f8` | 1 | `src/styles/01-foundation.css` |
| `#ff6f91` | 1 | `src/styles/06-settings-layout.css` |
| `#ff7d82` | 1 | `src/styles/03-acceleration.css` |
| `#ff8b72` | 1 | `src/styles/01-foundation.css` |
| `#ff8f91` | 1 | `src/styles/02-visual-refresh.css` |
| `#ff9a9d` | 2 | `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `#ff9b86` | 1 | `src/styles/06-settings-layout.css` |
| `#ffad9b` | 2 | `src/styles/01-foundation.css`, `src/styles/10-final-refinements.css` |
| `#ffb1b1` | 1 | `src/styles/10-final-refinements.css` |
| `#ffc0c1` | 1 | `src/styles/05-density-refinement.css` |
| `#ffc184` | 1 | `src/styles/10-final-refinements.css` |
| `#ffc2c8` | 1 | `src/styles/01-foundation.css` |
| `#ffd36e` | 1 | `src/styles/01-foundation.css` |
| `#ffd58c` | 1 | `src/styles/01-foundation.css` |
| `#ffe9e9` | 1 | `src/styles/03-acceleration.css` |
| `#fff` | 4 | `src/styles/01-foundation.css`, `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css`, `src/styles/11-history-curation.css` |
| `#fff3d9` | 1 | `src/styles/03-acceleration.css` |
| `#fff5f5` | 1 | `src/styles/05-density-refinement.css` |

#### 跨文件重复 selector（前 30 个）

| selector | 文件数 | 文件 |
| --- | ---: | --- |
| `.composer` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.create-workspace` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.create-workspace > .media-panel` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.drop-zone` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.history-gallery.album` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.history-gallery.masonry` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.history-heading` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.history-view-tools` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.page-heading` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/05-density-refinement.css` |
| `.settings-layout` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/06-settings-layout.css` |
| `.settings-sidebar` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/06-settings-layout.css` |
| `.settings-tab` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/06-settings-layout.css` |
| `body` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css`, `src/styles/10-final-refinements.css` |
| `to` | 4 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css`, `src/styles/10-final-refinements.css` |
| `.app-shell` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.drop-zone.has-image` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `.environment-panel` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-detail-back` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-detail-hero` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-gallery-item` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `.history-heading p` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `.history-player` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-player-column` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-summary` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.history-view-tools label` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `.media-panel` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.nav-button` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |
| `.page-heading p` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/05-density-refinement.css` |
| `.panel` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/10-final-refinements.css` |
| `.settings-page` | 3 | `src/styles/01-foundation.css`, `src/styles/02-visual-refresh.css`, `src/styles/04-history-stage.css` |

### Prototype shared CSS

扫描文件：`prototypes/studio-prototype.css`

| 指标 | 数值 |
| --- | ---: |
| unique hex | 177 |
| unique selector | 299 |
| 跨文件重复 selector | 0 |
| .primary 选择器引用 | 0 |
| `--primary` token 引用 | 0 |

#### 9/10/11px 字号

| font-size | 次数 |
| --- | ---: |
| 9px | 0 |
| 10px | 2 |
| 11px | 8 |

#### unique hex 清单

| hex | 文件数 | 文件 |
| --- | ---: | --- |
| `#0000001e` | 1 | `prototypes/studio-prototype.css` |
| `#0007` | 1 | `prototypes/studio-prototype.css` |
| `#0008` | 1 | `prototypes/studio-prototype.css` |
| `#0009` | 1 | `prototypes/studio-prototype.css` |
| `#000b` | 1 | `prototypes/studio-prototype.css` |
| `#03060bc7` | 1 | `prototypes/studio-prototype.css` |
| `#070b11` | 1 | `prototypes/studio-prototype.css` |
| `#070b11d9` | 1 | `prototypes/studio-prototype.css` |
| `#07101ac9` | 1 | `prototypes/studio-prototype.css` |
| `#071326` | 1 | `prototypes/studio-prototype.css` |
| `#080b10` | 1 | `prototypes/studio-prototype.css` |
| `#080d13` | 1 | `prototypes/studio-prototype.css` |
| `#08101bd9` | 1 | `prototypes/studio-prototype.css` |
| `#081425` | 1 | `prototypes/studio-prototype.css` |
| `#08213a` | 1 | `prototypes/studio-prototype.css` |
| `#090c12` | 1 | `prototypes/studio-prototype.css` |
| `#090c12e8` | 1 | `prototypes/studio-prototype.css` |
| `#090d13` | 1 | `prototypes/studio-prototype.css` |
| `#090d14c9` | 1 | `prototypes/studio-prototype.css` |
| `#090e15` | 1 | `prototypes/studio-prototype.css` |
| `#0b1017` | 1 | `prototypes/studio-prototype.css` |
| `#0b1119` | 1 | `prototypes/studio-prototype.css` |
| `#0b121c` | 1 | `prototypes/studio-prototype.css` |
| `#0c1119` | 1 | `prototypes/studio-prototype.css` |
| `#0c1420` | 1 | `prototypes/studio-prototype.css` |
| `#0c1a2fe8` | 1 | `prototypes/studio-prototype.css` |
| `#0d121a` | 1 | `prototypes/studio-prototype.css` |
| `#0d131b` | 1 | `prototypes/studio-prototype.css` |
| `#0d131c` | 1 | `prototypes/studio-prototype.css` |
| `#0d141e` | 1 | `prototypes/studio-prototype.css` |
| `#0f141d` | 1 | `prototypes/studio-prototype.css` |
| `#101720` | 1 | `prototypes/studio-prototype.css` |
| `#101720e8` | 1 | `prototypes/studio-prototype.css` |
| `#101923` | 1 | `prototypes/studio-prototype.css` |
| `#101b2aef` | 1 | `prototypes/studio-prototype.css` |
| `#102039` | 1 | `prototypes/studio-prototype.css` |
| `#10251b` | 1 | `prototypes/studio-prototype.css` |
| `#102541` | 1 | `prototypes/studio-prototype.css` |
| `#111720` | 1 | `prototypes/studio-prototype.css` |
| `#111f32` | 1 | `prototypes/studio-prototype.css` |
| `#122039` | 1 | `prototypes/studio-prototype.css` |
| `#131b27` | 1 | `prototypes/studio-prototype.css` |
| `#13233a` | 1 | `prototypes/studio-prototype.css` |
| `#132641` | 1 | `prototypes/studio-prototype.css` |
| `#142034` | 1 | `prototypes/studio-prototype.css` |
| `#151c26` | 1 | `prototypes/studio-prototype.css` |
| `#151d29` | 1 | `prototypes/studio-prototype.css` |
| `#151f2b` | 1 | `prototypes/studio-prototype.css` |
| `#16202d` | 1 | `prototypes/studio-prototype.css` |
| `#172235` | 1 | `prototypes/studio-prototype.css` |
| `#17243a` | 1 | `prototypes/studio-prototype.css` |
| `#172944` | 1 | `prototypes/studio-prototype.css` |
| `#172945` | 1 | `prototypes/studio-prototype.css` |
| `#1a2028` | 1 | `prototypes/studio-prototype.css` |
| `#1a2331` | 1 | `prototypes/studio-prototype.css` |
| `#1d2634` | 1 | `prototypes/studio-prototype.css` |
| `#1d2a3e` | 1 | `prototypes/studio-prototype.css` |
| `#202b3c` | 1 | `prototypes/studio-prototype.css` |
| `#203044` | 1 | `prototypes/studio-prototype.css` |
| `#243145` | 1 | `prototypes/studio-prototype.css` |
| `#24334a` | 1 | `prototypes/studio-prototype.css` |
| `#252d39` | 1 | `prototypes/studio-prototype.css` |
| `#253752` | 1 | `prototypes/studio-prototype.css` |
| `#263246` | 1 | `prototypes/studio-prototype.css` |
| `#26384c` | 1 | `prototypes/studio-prototype.css` |
| `#273141` | 1 | `prototypes/studio-prototype.css` |
| `#273143` | 1 | `prototypes/studio-prototype.css` |
| `#273246` | 1 | `prototypes/studio-prototype.css` |
| `#274f78` | 1 | `prototypes/studio-prototype.css` |
| `#28364b` | 1 | `prototypes/studio-prototype.css` |
| `#28384e` | 1 | `prototypes/studio-prototype.css` |
| `#285641` | 1 | `prototypes/studio-prototype.css` |
| `#29333f` | 1 | `prototypes/studio-prototype.css` |
| `#293548` | 1 | `prototypes/studio-prototype.css` |
| `#2a171b` | 1 | `prototypes/studio-prototype.css` |
| `#2a2112` | 1 | `prototypes/studio-prototype.css` |
| `#2b171b` | 1 | `prototypes/studio-prototype.css` |
| `#2b3545` | 1 | `prototypes/studio-prototype.css` |
| `#2b3749` | 1 | `prototypes/studio-prototype.css` |
| `#2b384b` | 1 | `prototypes/studio-prototype.css` |
| `#2b394d` | 1 | `prototypes/studio-prototype.css` |
| `#2c394c` | 1 | `prototypes/studio-prototype.css` |
| `#2d3a4d` | 1 | `prototypes/studio-prototype.css` |
| `#2d3a4e` | 1 | `prototypes/studio-prototype.css` |
| `#2f3c50` | 1 | `prototypes/studio-prototype.css` |
| `#303b4d` | 1 | `prototypes/studio-prototype.css` |
| `#30405a` | 1 | `prototypes/studio-prototype.css` |
| `#334156` | 1 | `prototypes/studio-prototype.css` |
| `#344258` | 1 | `prototypes/studio-prototype.css` |
| `#35639a` | 1 | `prototypes/studio-prototype.css` |
| `#365276` | 1 | `prototypes/studio-prototype.css` |
| `#38404c` | 1 | `prototypes/studio-prototype.css` |
| `#38557b` | 1 | `prototypes/studio-prototype.css` |
| `#3a4c66` | 1 | `prototypes/studio-prototype.css` |
| `#3b4a61` | 1 | `prototypes/studio-prototype.css` |
| `#3f5e87` | 1 | `prototypes/studio-prototype.css` |
| `#40506a` | 1 | `prototypes/studio-prototype.css` |
| `#405675` | 1 | `prototypes/studio-prototype.css` |
| `#42536c` | 1 | `prototypes/studio-prototype.css` |
| `#426ea8` | 1 | `prototypes/studio-prototype.css` |
| `#465265` | 1 | `prototypes/studio-prototype.css` |
| `#4b78b9` | 1 | `prototypes/studio-prototype.css` |
| `#4c8ff7` | 1 | `prototypes/studio-prototype.css` |
| `#4d6070` | 1 | `prototypes/studio-prototype.css` |
| `#4d6174` | 1 | `prototypes/studio-prototype.css` |
| `#4d7cbd` | 1 | `prototypes/studio-prototype.css` |
| `#4d88ed` | 1 | `prototypes/studio-prototype.css` |
| `#4d88ed35` | 1 | `prototypes/studio-prototype.css` |
| `#4f91ff` | 1 | `prototypes/studio-prototype.css` |
| `#5798ff` | 1 | `prototypes/studio-prototype.css` |
| `#5b7187` | 1 | `prototypes/studio-prototype.css` |
| `#5d91d9` | 1 | `prototypes/studio-prototype.css` |
| `#5e9cff1f` | 1 | `prototypes/studio-prototype.css` |
| `#5f9bff` | 1 | `prototypes/studio-prototype.css` |
| `#63363e` | 1 | `prototypes/studio-prototype.css` |
| `#65363d` | 1 | `prototypes/studio-prototype.css` |
| `#667285` | 1 | `prototypes/studio-prototype.css` |
| `#674d2b` | 1 | `prototypes/studio-prototype.css` |
| `#67d79d` | 1 | `prototypes/studio-prototype.css` |
| `#6ea7ff` | 1 | `prototypes/studio-prototype.css` |
| `#6fa7ff` | 1 | `prototypes/studio-prototype.css` |
| `#72a8ff55` | 1 | `prototypes/studio-prototype.css` |
| `#78adff` | 1 | `prototypes/studio-prototype.css` |
| `#7d4d3d` | 1 | `prototypes/studio-prototype.css` |
| `#815a4c` | 1 | `prototypes/studio-prototype.css` |
| `#82b5ff` | 1 | `prototypes/studio-prototype.css` |
| `#86b8ff` | 1 | `prototypes/studio-prototype.css` |
| `#87b7ff` | 1 | `prototypes/studio-prototype.css` |
| `#88533d` | 1 | `prototypes/studio-prototype.css` |
| `#885943` | 1 | `prototypes/studio-prototype.css` |
| `#8dc0ff` | 1 | `prototypes/studio-prototype.css` |
| `#8e9bb0` | 1 | `prototypes/studio-prototype.css` |
| `#8fbaff` | 1 | `prototypes/studio-prototype.css` |
| `#91a3bd` | 1 | `prototypes/studio-prototype.css` |
| `#91e8b9` | 1 | `prototypes/studio-prototype.css` |
| `#9b5c3d` | 1 | `prototypes/studio-prototype.css` |
| `#9bc3ff` | 1 | `prototypes/studio-prototype.css` |
| `#9eb1cc` | 1 | `prototypes/studio-prototype.css` |
| `#9ec3ff` | 1 | `prototypes/studio-prototype.css` |
| `#9fb4cf` | 1 | `prototypes/studio-prototype.css` |
| `#9fbce2` | 1 | `prototypes/studio-prototype.css` |
| `#9fc5ff` | 1 | `prototypes/studio-prototype.css` |
| `#a6654b` | 1 | `prototypes/studio-prototype.css` |
| `#a8caff` | 1 | `prototypes/studio-prototype.css` |
| `#a8e6c2` | 1 | `prototypes/studio-prototype.css` |
| `#a9b8cd` | 1 | `prototypes/studio-prototype.css` |
| `#a9cbff` | 1 | `prototypes/studio-prototype.css` |
| `#aebbd0` | 1 | `prototypes/studio-prototype.css` |
| `#b96f4c` | 1 | `prototypes/studio-prototype.css` |
| `#b9cbe3` | 1 | `prototypes/studio-prototype.css` |
| `#b9d4ff` | 1 | `prototypes/studio-prototype.css` |
| `#bac8dc` | 1 | `prototypes/studio-prototype.css` |
| `#bcd7ff` | 1 | `prototypes/studio-prototype.css` |
| `#c87b50` | 1 | `prototypes/studio-prototype.css` |
| `#c9d7ec` | 1 | `prototypes/studio-prototype.css` |
| `#d63238` | 1 | `prototypes/studio-prototype.css` |
| `#dbe9ff` | 1 | `prototypes/studio-prototype.css` |
| `#dceaff` | 1 | `prototypes/studio-prototype.css` |
| `#dfa170` | 1 | `prototypes/studio-prototype.css` |
| `#e0b29a` | 1 | `prototypes/studio-prototype.css` |
| `#eaf3ff` | 1 | `prototypes/studio-prototype.css` |
| `#eea46e` | 1 | `prototypes/studio-prototype.css` |
| `#eef4ff` | 1 | `prototypes/studio-prototype.css` |
| `#f06b78` | 1 | `prototypes/studio-prototype.css` |
| `#f1bb66` | 1 | `prototypes/studio-prototype.css` |
| `#f4f7fb` | 1 | `prototypes/studio-prototype.css` |
| `#f6bd4f` | 1 | `prototypes/studio-prototype.css` |
| `#ff4f55` | 1 | `prototypes/studio-prototype.css` |
| `#ff4f5538` | 1 | `prototypes/studio-prototype.css` |
| `#ff4f5578` | 1 | `prototypes/studio-prototype.css` |
| `#ff7a7a` | 1 | `prototypes/studio-prototype.css` |
| `#ff8186` | 1 | `prototypes/studio-prototype.css` |
| `#ff9e9e` | 1 | `prototypes/studio-prototype.css` |
| `#ffaaaa` | 1 | `prototypes/studio-prototype.css` |
| `#ffb0b0` | 1 | `prototypes/studio-prototype.css` |
| `#ffd594` | 1 | `prototypes/studio-prototype.css` |
| `#fff` | 1 | `prototypes/studio-prototype.css` |

#### 跨文件重复 selector（前 30 个）

| selector | 文件数 | 文件 |
| --- | ---: | --- |
| — | 0 | — |


## 解读边界

- “primary usage”同时记录 `.primary` class 和 `--primary` token 引用，避免把组件类与颜色变量混为一个指标。
- 9/10/11px 只统计 `font-size` 声明，不评价其它尺寸、line-height 或实际屏幕渲染结果。
- 该报告用于 P02/P03/P04/P19 的迁移前后比较；不要用它证明颜色对比度、键盘可用性或 renderer 与 prototype 已经一致。
