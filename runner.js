#!/usr/bin/env node
// runner.js
// Tu dong sinh video quang cao san pham (1080x1920, 30fps, 20s) tu WooCommerce
// Store API cua lucas.vn, dung template co san trong template/ (khong sua template).
// Sau khi render xong, tu dong dang len Facebook Page Reels (neu co credentials).
//
// Dung:
//   node runner.js                  # lay san pham MOI NHAT tu Store API
//   node runner.js --id 52232       # chi dinh san pham cu the
//   node runner.js --no-publish     # chi render, khong dang Facebook

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { mapWooProduct } from './template/map-product.js';
import { publishReelToFacebook } from './publishers/facebook.js';
import { polishCopy } from './polish.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, 'template');
const OUT_DIR = path.join(__dirname, 'out');

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const DURATION_SEC = 20;
const TOTAL_FRAMES = FPS * DURATION_SEC; // 600

function log(msg) {
  console.log(`[runner] ${msg}`);
}

function parseArgs(argv) {
  const args = { id: null, publish: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') {
      args.id = argv[++i];
    } else if (a.startsWith('--id=')) {
      args.id = a.slice('--id='.length);
    } else if (a === '--no-publish') {
      args.publish = false;
    }
  }
  if (args.id == null) return { id: null, publish: args.publish };
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`--id khong hop le: ${args.id}`);
  }
  return { id, publish: args.publish };
}

async function fetchProductById(id) {
  const url = `https://lucas.vn/wp-json/wc/store/v1/products/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch product ${id} that bai: HTTP ${res.status} (${url})`);
  return res.json();
}

async function fetchLatestProduct() {
  const url = 'https://lucas.vn/wp-json/wc/store/v1/products?orderby=date&order=desc&per_page=1';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch danh sach san pham that bai: HTTP ${res.status} (${url})`);
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error('Store API tra ve danh sach san pham rong.');
  return list[0];
}

// Caption day du (khong chua link san pham — link duoc dang rieng o comment,
// xem publishReelToFacebook({ linkComment })).
function buildFacebookCaption(product, props) {
  const hasDiscount = props.discountPercent && props.discountPercent !== '0';
  const lines = [
    props.productName,
    '',
    props.hookLine,
    '',
    ...[props.feature1, props.feature2, props.feature3, props.feature4]
      .filter(Boolean)
      .map((f) => `✅ ${f}`),
    '',
    hasDiscount ? `${props.priceSale} (giảm ${props.discountPercent}%)` : props.priceSale,
    props.coupon ? `🎁 Mã ${props.coupon}: ${props.couponValue}` : null,
    '',
    props.ctaLine,
    hasDiscount ? '#lucasvn #giasoc' : '#lucasvn #chinhhang',
  ].filter((l) => l !== null);
  return lines.join('\n');
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tai anh that bai: HTTP ${res.status} (${url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await fsp.writeFile(destPath, buf); // ghi de
}

// Server tinh don gian phuc vu thu muc template/ qua HTTP (khong dung file://
// vi template nap support.js / .jsx bang duong dan tuong doi).
function serveDir(dir) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.jsx': 'text/plain; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
  };
  const rootReal = fs.realpathSync(dir);

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/video-template.dc.html' : urlPath;
      const filePath = path.join(rootReal, rel);
      const filePathReal = await fsp.realpath(filePath).catch(() => filePath);
      if (!filePathReal.startsWith(rootReal)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fsp.readFile(filePathReal);
      const ext = path.extname(filePathReal).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function toBase64Utf8(str) {
  // Doi xung voi cach video-template.dc.html giai ma:
  // JSON.parse(decodeURIComponent(escape(atob(q))))
  return Buffer.from(str, 'utf8').toString('base64');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

async function saveReelToHistory(postId, product, props, caption) {
  const historyFile = path.join(__dirname, 'reels_history.json');
  let history = [];
  try {
    const data = await fsp.readFile(historyFile, 'utf8');
    history = JSON.parse(data);
  } catch (e) {
    history = [];
  }
  const newEntry = {
    post_id: postId,
    product_id: product.id,
    product_name: props.productName,
    hook_line: props.hookLine,
    caption: caption,
    publish_time: new Date().toISOString(),
    performance: null
  };
  history.push(newEntry);
  await fsp.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf8');
}

async function renderFrames(page, framesDir) {
  const svg = await page.$('svg');
  if (!svg) throw new Error('Khong tim thay phan tu <svg> tren trang.');

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;
    await page.evaluate((time) => {
      document.querySelector('svg').dispatchEvent(
        new CustomEvent('data-om-seek-to-time-frame', { detail: { time, frame: 0 } })
      );
    }, t);
    await new Promise((r) => setTimeout(r, 30));
    const framePath = path.join(framesDir, `f${String(i).padStart(4, '0')}.jpg`);
    await svg.screenshot({ path: framePath, type: 'jpeg', quality: 92 });
    if (i % 60 === 0 || i === TOTAL_FRAMES - 1) {
      log(`  render frame ${i + 1}/${TOTAL_FRAMES}`);
    }
  }
}

async function encodeVideo(framesDir, outFile) {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const bgmPath = path.join(__dirname, 'assets', 'bgm.m4a');
  const hasBgm = fs.existsSync(bgmPath);

  const args = ['-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%04d.jpg')];

  if (hasBgm) {
    args.push(
      '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', `[1:a]afade=t=out:st=${DURATION_SEC - 1}:d=1[aout]`,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest'
    );
  } else {
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18');
  }

  args.push('-movflags', '+faststart', outFile);
  log(`ffmpeg ${args.join(' ')}`);
  await execFileAsync('ffmpeg', args);
}

async function main() {
  const { id: explicitId, publish } = parseArgs(process.argv.slice(2));

  const framesDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'product-video-frames-'));
  let server;
  let browser;

  try {
    let product;
    if (explicitId) {
      log(`Product id: ${explicitId}`);
      product = await fetchProductById(explicitId);
    } else {
      log('Khong truyen --id, lay san pham moi nhat tu Store API...');
      product = await fetchLatestProduct();
      log(`San pham moi nhat: id=${product.id} - ${product.name}`);
    }
    const id = product.id;

    // Lay tối đa 3 anh KHAC NHAU (dedup theo URL) de moi man video dung 1 shot
    // rieng, video sinh dong hon. Neu san pham co it anh thi lap lai anh dau.
    const allUrls = (product.images || []).map((im) => im && im.src).filter(Boolean);
    const uniqueUrls = [...new Set(allUrls)];
    if (uniqueUrls.length === 0) throw new Error('Product khong co anh nao (images[].src rong)');
    const chosen = [0, 1, 2].map((i) => uniqueUrls[i] || uniqueUrls[uniqueUrls.length - 1]);

    const imageRelPaths = ['images/product.png', 'images/product2.png', 'images/product3.png'];
    for (let i = 0; i < chosen.length; i++) {
      log(`Tai anh ${i + 1}/${chosen.length}: ${chosen[i]}`);
      await downloadImage(chosen[i], path.join(TEMPLATE_DIR, imageRelPaths[i]));
    }
    const imageRelPath = imageRelPaths[0];

    const props = mapWooProduct(product, {
      productImageLocalPath: imageRelPath,
      productImageLocalPath2: imageRelPaths[1],
      productImageLocalPath3: imageRelPaths[2],
      coupon: 'LUCAS79K',
      couponValue: 'Giảm thêm 79.000đ',
      accent: '#3B7DFF',
      // Giu nguyen anh goc tu web (co the co nen trang/xam nhe rieng), khong
      // co tach nen nua — tranh loi cutout voi san pham mau sang.
      cutout: false,
    });
    log(`Props: ${JSON.stringify(props)}`);

    let facebookCaption = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        log('Polish noi dung bang Claude...');
        const polished = await polishCopy(props);
        props.hookLine = polished.hookLine;
        props.feature1 = polished.feature1;
        props.feature2 = polished.feature2;
        props.feature3 = polished.feature3;
        props.feature4 = polished.feature4;
        facebookCaption = polished.facebookCaption;
      } catch (e) {
        log(`Polish that bai, dung noi dung goc: ${e.message}`);
      }
    } else {
      log('Bo qua polish: thieu bien moi truong ANTHROPIC_API_KEY.');
    }

    log('Serving template/ qua HTTP...');
    server = await serveDir(TEMPLATE_DIR);
    const port = server.address().port;

    const dataParam = encodeURIComponent(toBase64Utf8(JSON.stringify(props)));
    const pageUrl = `http://127.0.0.1:${port}/video-template.dc.html?data=${dataParam}`;
    log(`Mo Puppeteer: ${pageUrl.slice(0, 90)}...`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    // Render truc tiep o 1080x1920 (deviceScaleFactor 1) de tiet kiem dung luong.
    await page.setViewport({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, deviceScaleFactor: 1 });

    page.on('pageerror', (e) => log(`  [pageerror] ${e}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') log(`  [console.error] ${msg.text()}`);
    });

    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 120000 });

    log('Cho svg[data-om-fonts-inlined] san sang...');
    await page.waitForSelector('svg[data-om-fonts-inlined="true"]', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800));

    await page.evaluate(() => {
      const s = document.querySelector('svg');
      s.style.transform = 'none';
    });

    log(`Render ${TOTAL_FRAMES} frame (${FPS}fps x ${DURATION_SEC}s)...`);
    await renderFrames(page, framesDir);

    await browser.close();
    browser = null;

    const outFile = path.join(OUT_DIR, `${id}-${todayYYYYMMDD()}.mp4`);
    log('Ghep video bang ffmpeg...');
    await encodeVideo(framesDir, outFile);
    log(`Xong! Video: ${outFile}`);

    if (publish) {
      if (process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN) {
        const caption = facebookCaption || buildFacebookCaption(product, props);
        const linkComment = product.permalink ? `Xem chi tiết & đặt hàng: ${product.permalink}` : undefined;
        log('Dang len Facebook Page Reels...');
        const fbResult = await publishReelToFacebook(outFile, { description: caption, linkComment });
        if (fbResult && fbResult.post_id) {
          try {
            await saveReelToHistory(fbResult.post_id, product, props, caption);
            log('Da luu Reel vao lich su reels_history.json');
          } catch (eHistory) {
            log(`Loi khi luu lich su Reel: ${eHistory.message}`);
          }
        }
      } else {
        log('Bo qua dang Facebook: thieu bien moi truong FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN.');
      }
    } else {
      log('Bo qua dang Facebook (--no-publish).');
    }

    return outFile;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((r) => server.close(r));
    await fsp.rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[runner] LOI:', err);
  process.exitCode = 1;
});
