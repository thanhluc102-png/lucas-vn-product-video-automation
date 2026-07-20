// sync_insights.js
// Dong bo metrics tuong tac cho tung video Reels tu Facebook Graph API.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FB_PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const GRAPH_BASE = 'https://graph.facebook.com/v25.0';

async function getEngagement(postId, token) {
  const pids = [postId, `${FB_PAGE_ID}_${postId}`];
  for (const pid of pids) {
    const url = `${GRAPH_BASE}/${pid}?fields=reactions.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(token)}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const reactions = json.reactions?.summary?.total_count || 0;
        const comments = json.comments?.summary?.total_count || 0;
        const shares = json.shares?.count || 0;
        return {
          reactions,
          comments,
          shares,
          score: reactions * 1 + comments * 3 + shares * 5
        };
      }
    } catch (e) {
      console.error(`Loi fetch stats cho ${pid}:`, e.message);
    }
  }
  return null;
}

async function main() {
  if (!FB_PAGE_TOKEN) {
    console.log('Thieu FB_PAGE_ACCESS_TOKEN. Bo qua.');
    return;
  }
  
  console.log('=== DONG BO TUONG TAC VIDEO REELS ===');
  const historyFile = path.join(__dirname, 'reels_history.json');
  
  let history = [];
  try {
    const raw = await fs.readFile(historyFile, 'utf8');
    history = JSON.parse(raw);
  } catch (e) {
    console.log('Khong tim thay hoac loi doc file reels_history.json.');
    return;
  }
  
  let updated = false;
  const now = new Date();
  
  for (const entry of history) {
    if (!entry.post_id) continue;
    
    const publishTime = new Date(entry.publish_time);
    const ageDays = (now - publishTime) / (1000 * 60 * 60 * 24);
    
    // Sync post tuong tac trong 7 ngay qua
    if (ageDays < 7) {
      console.log(`Dong bo reels_id: ${entry.post_id} (${entry.product_name})...`);
      const stats = await getEngagement(entry.post_id, FB_PAGE_TOKEN);
      if (stats) {
        entry.performance = stats;
        updated = true;
        console.log(` -> Kết quả: L:${stats.reactions}, C:${stats.comments}, S:${stats.shares}`);
      }
    }
  }
  
  if (updated) {
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf8');
    console.log('Da luu reels_history.json.');
  }
}

main().catch(console.error);
