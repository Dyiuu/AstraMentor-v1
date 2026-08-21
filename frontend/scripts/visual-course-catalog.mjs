import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(frontendRoot, '..');
const outputDirectory = process.env.ASTRA_VISUAL_OUTPUT
  ? resolve(process.env.ASTRA_VISUAL_OUTPUT)
  : resolve(repositoryRoot, 'docs', 'qa', '2026-08-20-ai-course-catalog');
const appUrl = process.argv[2] || process.env.ASTRA_VISUAL_BASE_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const courseSeed = [
  ['agent-design', '智能体设计与应用开发基础', 'unspecified', '智能体产品助理'],
  ['llm-app-development', '大模型应用开发', 'intermediate', '大模型应用开发工程师'],
  ['rag-knowledge-engineering', 'RAG 知识库工程', 'intermediate', 'RAG 知识库工程师'],
  ['agent-engineering', 'Agent 开发工程师', 'advanced', 'Agent 开发工程师'],
  ['ai-app-production', 'AI 应用测试、部署与安全', 'advanced', 'AI 应用测试与部署工程师'],
];

const courses = courseSeed.map(([id, title, level, role], index) => {
  const status = index === 1 ? 'building' : index === 4 ? 'failed' : 'ready';
  return {
    id,
    title,
    description: '围绕真实岗位任务完成可运行、可测试、可展示的人工智能应用工程项目，并形成可核验的课程学习成果。',
    locale: 'zh-CN',
    version: '1.0',
    category: '人工智能应用',
    order: (index + 1) * 10,
    hours: index === 0 ? 0 : 32,
    level,
    track: 'AI 应用工程',
    prerequisite_skills: index === 0 ? [] : ['Python', 'HTTP/JSON', '异步编程', '环境变量', 'Git/Linux'],
    recommended_courses: index > 1 ? [courseSeed[index - 1][0]] : [],
    job_roles: [role],
    competencies: ['实现可靠的模型与工具调用', '定位并修复常见工程故障', '提交可复现的岗位项目成果'],
    capstone: '完成一个带测试证据、运行说明和验收记录的综合职业项目。',
    tags: ['项目化学习', '工程实践'],
    materials: Array.from({ length: index === 0 ? 1 : 8 }, (_, materialIndex) => ({
      id: `material-${materialIndex + 1}`,
      title: `项目 ${materialIndex + 1}`,
      path: `materials/${materialIndex + 1}.md`,
      relative_path: `materials/${materialIndex + 1}.md`,
    })),
    index: {
      status,
      course_id: id,
      chunk_count: status === 'ready' ? 48 + index : 0,
      message: status === 'failed' ? '模拟索引构建失败状态' : status === 'building' ? '索引正在构建' : '',
      built_at: '',
    },
  };
});

const viewportMatrix = [
  { width: 1440, height: 900, expectedColumns: 3 },
  { width: 1024, height: 768, expectedColumns: 2 },
  { width: 900, height: 768, expectedColumns: 2 },
  { width: 620, height: 900, expectedColumns: 1 },
  { width: 390, height: 844, expectedColumns: 1 },
];

const screenshotScenarios = new Map([
  ['1440x900-night', '1440x900-night.png'],
  ['1024x768-night', '1024x768-night-expanded.png'],
  ['900x768-eye-care', '900x768-eye-care.png'],
  ['620x900-night', '620x900-night-failed-recovery.png'],
  ['390x844-eye-care', '390x844-eye-care-expanded.png'],
]);

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
page.on('pageerror', (error) => process.stderr.write(`[pageerror] ${error.message}\n`));
page.on('requestfailed', (request) => {
  if (request.url().startsWith('http://127.0.0.1')) {
    process.stderr.write(`[requestfailed] ${request.url()} ${request.failure()?.errorText || ''}\n`);
  }
});

await page.route('http://127.0.0.1:8000/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    return;
  }
  if (url.pathname === '/api/courses') {
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses, invalid_courses: {}, course_warnings: {} }),
    });
    return;
  }
  if (url.pathname === '/api/state') {
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      body: JSON.stringify({ total: 0, mastered: 0, average_mastery: 0 }),
    });
    return;
  }
  if (url.pathname === '/api/sessions') {
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ sessions: [] }) });
    return;
  }
  if (url.pathname === '/api/graph/generate') {
    await route.fulfill({
      status: 409,
      headers: corsHeaders,
      body: JSON.stringify({
        detail: {
          code: 'course_index_not_ready',
          course_id: 'agent-design',
          status: 'stale',
          message: '教材已更新，请重建课程索引',
        },
      }),
    });
    return;
  }
  await route.fulfill({ status: 404, headers: corsHeaders, body: JSON.stringify({ detail: 'not mocked' }) });
});

await mkdir(outputDirectory, { recursive: true });
const report = [];
try {
  for (const viewport of viewportMatrix) {
    for (const theme of ['night', 'eye-care']) {
      const key = `${viewport.width}x${viewport.height}-${theme}`;
      const expandDetails = viewport.width === 1024 || viewport.width <= 620;
      const recovery = viewport.width === 620 && theme === 'night';
      await page.setViewportSize(viewport);
      await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('.course-card').first().waitFor();
      await page.evaluate((selectedTheme) => {
        document.documentElement.classList.remove('dark', 'eye-care');
        document.documentElement.classList.add(selectedTheme === 'eye-care' ? 'eye-care' : 'dark');
      }, theme);
      if (expandDetails) await page.locator('.course-card__details summary').first().click();
      if (recovery) {
        await page.locator('#course-agent-design .course-card__actions button').first().click();
        await page.locator('#course-agent-design.course-card--recovery').waitFor();
      }
      await page.waitForTimeout(550);

      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.course-card')];
        const rectangles = cards.map((card) => card.getBoundingClientRect());
        const overlaps = [];
        for (let first = 0; first < rectangles.length; first += 1) {
          for (let second = first + 1; second < rectangles.length; second += 1) {
            const a = rectangles[first];
            const b = rectangles[second];
            if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
              overlaps.push([first, second]);
            }
          }
        }
        const firstRowTop = Math.min(...rectangles.map((rect) => Math.round(rect.top)));
        const columns = rectangles.filter((rect) => Math.round(rect.top) === firstRowTop).length;

        const parseColor = (value) => {
          const parts = value.match(/[\d.]+/g)?.map(Number) || [];
          return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] ?? 1 };
        };
        const composite = (front, back) => ({
          r: front.r * front.a + back.r * (1 - front.a),
          g: front.g * front.a + back.g * (1 - front.a),
          b: front.b * front.a + back.b * (1 - front.a),
          a: 1,
        });
        const effectiveBackground = (element) => {
          const layers = [];
          for (let current = element; current; current = current.parentElement) {
            layers.push(parseColor(getComputedStyle(current).backgroundColor));
          }
          return layers.reverse().reduce((background, layer) => composite(layer, background), { r: 255, g: 255, b: 255, a: 1 });
        };
        const luminance = (color) => {
          const channel = (value) => {
            const normalized = value / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
        };
        const contrast = (first, second) => {
          const a = luminance(first);
          const b = luminance(second);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const contrastSelectors = [
          '.course-card__meta span',
          '.course-card h3',
          '.course-card__description',
          '.course-card__facts span',
          '.course-card__badges span',
          '.course-card__recommended',
          '.course-card__details summary',
          '.course-card__stats span',
          '.course-card__message',
          '.course-card__actions button',
        ];
        const contrastChecks = contrastSelectors.flatMap((selector) =>
          [...document.querySelectorAll(selector)].flatMap((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return [];
            const style = getComputedStyle(element);
            const background = effectiveBackground(element);
            const foreground = composite(parseColor(style.color), background);
            const ratio = contrast(foreground, background);
            const fontSize = Number.parseFloat(style.fontSize);
            const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
            const minimum = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
            return [{ selector, text: element.textContent?.trim().slice(0, 80) || '', ratio, minimum, passed: ratio >= minimum }];
          }),
        );
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardOverflows: cards.map((card) => card.scrollWidth - card.clientWidth),
          actionOutsideCard: cards.map((card) => {
            const action = card.querySelector('.course-card__actions')?.getBoundingClientRect();
            const rect = card.getBoundingClientRect();
            return Boolean(action && (action.left < rect.left - 1 || action.right > rect.right + 1 || action.bottom > rect.bottom + 1));
          }),
          overlaps,
          columns,
          minimumContrast: contrastChecks.length ? Math.min(...contrastChecks.map((check) => check.ratio)) : null,
          contrastFailures: contrastChecks.filter((check) => !check.passed),
        };
      });

      const passed = result.pageOverflow <= 0
        && result.cardOverflows.every((overflow) => overflow <= 0)
        && result.actionOutsideCard.every((outside) => !outside)
        && result.overlaps.length === 0
        && result.columns === viewport.expectedColumns
        && result.contrastFailures.length === 0;
      const screenshotName = screenshotScenarios.get(key);
      if (screenshotName) {
        await page.screenshot({ path: resolve(outputDirectory, screenshotName), fullPage: true });
      }
      report.push({
        viewport: `${viewport.width}x${viewport.height}`,
        theme,
        detailsExpanded: expandDetails,
        recovery,
        states: ['ready', 'building', 'failed'],
        screenshot: screenshotName || null,
        ...result,
        passed,
      });
    }
  }
} finally {
  await browser.close();
}

const reportPath = resolve(outputDirectory, 'visual-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const failures = report.filter((entry) => !entry.passed);
process.stdout.write(`${JSON.stringify({ reportPath, scenarios: report.length, failures: failures.length }, null, 2)}\n`);
if (failures.length) {
  process.stderr.write(`${JSON.stringify(failures, null, 2)}\n`);
  process.exitCode = 1;
}
