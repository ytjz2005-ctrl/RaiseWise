# RaiseWise — 加薪计算器

面向美国英文用户的轻量工具站。暖白、鼠尾草绿与深绿配色；所有计算在浏览器完成。源代码不依赖第三方库，无需 VPS、数据库或付费 API。

## 已有功能

- 年薪／时薪输入；百分比加薪、固定金额加薪、目标工资反推。
- 按周、每两周（26 次）、每月两次（24 次）、每月发薪换算。
- 显示新年薪、每次发薪增量、每月／每年增量及小时工资等值。
- 可调整工作时间、带薪周数；可选假设通胀对比；支持降薪。
- 3%／5%／8% 快捷方案，点击即时更新。
- 记住输入；保存最多 6 个命名方案，比较、载入和删除。
- CSV 导出、结果复制、打印／另存为 PDF。
- 手机端输入时显示浮动结果，点击直达完整结果。
- About、Methodology、Privacy、FAQ、自定义 404。
- 语义化 HTML、键盘操作、表单错误提示、减少动态效果偏好支持。

**数据边界：**只计算税前工资，不计算税款、加班溢价或实际到手工资。方案保存在当前浏览器，不跨设备同步，清理浏览器数据会删除。已有隐私说明与删除操作。当前没有广告、第三方统计、外部字体或追踪脚本。

## 本地预览

需要 Node.js 20 或更新版本，不需要运行 `npm install`。

```powershell
node scripts/serve.mjs
```

在浏览器打开 **http://127.0.0.1:4173**。服务启动时会先构建页面。修改文件后，结束服务（Ctrl+C）再启动，或在另一终端执行 `node scripts/build.mjs` 然后刷新。

Windows 也可以双击项目中的 `start-preview.cmd`。它优先使用已安装的 Node.js，如未找到则尝试本机现有的 Codex Node.js 运行时。

**不要直接双击 HTML 文件预览。**本站使用 JavaScript 模块，必须通过 HTTP 服务器运行，否则浏览器可能阻止模块加载。

## GitHub + Cloudflare Pages

将此项目源码上传到你自己的 GitHub 仓库。`.gitignore` 已排除构建产物、临时浏览器数据和本地检查截图。无需把 `.qa/` 上传到 GitHub。

在 Cloudflare 中创建 **Pages** 项目，连接 GitHub 仓库并配置：

| 项目 | 设置 |
|---|---|
| Production branch | `main`（或你的正式分支） |
| Framework preset | `None` |
| Build command | `node scripts/build.mjs` |
| Build output directory | `dist` |
| Root directory | 留空，使用仓库根目录 |
| Environment variable | `NODE_VERSION=22` |
| Environment variable | `SITE_URL=https://你的正式域名` |

`SITE_URL` 只能包含协议与主机名，例如 `https://example.com`，不能附带路径、查询参数或账号密码。若还没买域名，可以先不设置：部署后仍能正常使用 Pages 提供的网址；确定正式域名后，再设置 `SITE_URL` 并重新部署。

构建会自动生成：

- 四个页面各自正确的 canonical 和 `og:url`。
- `sitemap.xml`，包含首页、About、Methodology、Privacy。
- 指向该 sitemap 的 `robots.txt`。

没有填写正式域名时，构建不会输出虚假的 canonical 或 sitemap。也可以在 `site.config.json` 的 `url` 中填写正式域名；Cloudflare 的 `SITE_URL` 环境变量优先。

绑定自定义域名后，以该域名作为主站地址，测试 HTTPS 和 www／根域名跳转，再将 sitemap 提交到 Google Search Console。源代码中的品牌名是 **RaiseWise**，不代表已经购买或验证同名域名。

这个项目不需要 Cloudflare Functions，也不需要 Workers 配置文件。`public/_headers` 会随构建发布，配置基础响应头。`404.html` 用于真正不存在的路由，不使用单页应用通配回退。

## 文件结构

```text
public/
  index.html           首页内容与计算器结构
  styles.css           响应式样式、打印样式
  app.js               浏览器交互、本地保存与导出
  calculator.js        纯计算公式、校验、金额格式和 CSV
  favicon.svg          本地矢量标识
  _headers             Cloudflare Pages 响应头
  404.html             未找到页面
scripts/
  build.mjs            无依赖构建、SEO 元数据与 sitemap
  documents.mjs        关于、计算说明、隐私页的源内容
  serve.mjs            本地预览服务器
tests/
  calculator.test.mjs  计算和边界测试
  build.test.mjs       域名、sitemap 与构建校验
  browser.mjs          真实浏览器交互与布局检查
site.config.json       正式站点域名配置
dist/                  生成的可部署网站（自动创建）
```

## 检查与构建

```powershell
node --test tests/calculator.test.mjs tests/build.test.mjs
node scripts/build.mjs
node tests/browser.mjs
```

浏览器检查需要本机安装 Edge、Chrome 或 Chromium；可通过 `CHROME_PATH` 指定浏览器可执行文件。它使用独立临时配置，不接触个人浏览器配置。临时服务只绑定 `127.0.0.1`，端口为 `4174` 和 `9223`；检查结束自动关闭。

截图与检查报告保存在 `.qa/`。浏览器检查覆盖刷新恢复、记住输入开关、方案保存／载入／导出、非法输入、税前金额、手机布局、打印及静态页面。

## 上线与后续广告

当前交付是本地代码与可部署构建，尚未创建 GitHub 远程仓库、购买域名或部署到你的 Cloudflare 账户。

本版专注计算体验，没有广告空位或广告脚本。以后接入广告时，需要同步更新隐私说明、适用的同意管理，以及 `_headers` 中的 Content-Security-Policy。不要仅为了加载广告而删除所有安全响应头。广告审核与收入不由代码保证。

官方部署文档：

- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/pages/configuration/headers/

## 产品上的复访理由

重点是让用户保留自己的决策记录：记住当前工资、保存调薪方案、把预期涨幅与目标工资放在一起比较，下一次谈薪或收到新 offer 时可以直接回来调整。数据默认不出浏览器，也不用注册账户。
