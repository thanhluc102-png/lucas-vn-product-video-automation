// optimize_prompts.js
// Dung Claude de phan tich Reels performance va ghi ra learnings.txt

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-opus-4-8';

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.log('Thieu ANTHROPIC_API_KEY. Bo qua phan tich AI.');
    return;
  }
  
  console.log('=== PHAN TICH TUONG TAC REELS BANG AI ===');
  const historyFile = path.join(__dirname, 'reels_history.json');
  
  let history = [];
  try {
    const raw = await fs.readFile(historyFile, 'utf8');
    history = JSON.parse(raw);
  } catch (e) {
    console.log('Chua co lich su reels_history.json.');
  }
  
  const validReels = history.filter(r => r.performance);
  const learningsFile = path.join(__dirname, 'learnings.txt');
  
  if (validReels.length === 0) {
    console.log('Chua du du lieu tuong tac Reels.');
    // Chi ghi huong dan mac dinh khi CHUA co learnings.txt — dung ghi de len
    // bai hoc da tich luy chi vi mot lan sync khong co du lieu moi.
    try {
      await fs.access(learningsFile);
      console.log('Giu nguyen learnings.txt hien co.');
    } catch {
      const defaultInstructions = '- Viet ngan gon, tao ton, nhan vao tinh nang thuc te.\n- Hook line luon co cau hoi thu vi.\n- Tranh quang cao qua da, tap trung vao nhu cau nguoi dung.';
      await fs.writeFile(learningsFile, defaultInstructions, 'utf8');
    }
    return;
  }
  
  const reportLines = [];
  reportLines.push('--- VIDEO REELS SAN PHAM ---');
  // Lay toi da 15 Reels gan nhat
  for (const r of validReels.slice(-15)) {
    const perf = r.performance;
    reportLines.push(
      `San pham: ${r.product_name}`,
      `Hook: ${r.hook_line}`,
      `Tuong tac: Reactions=${perf.reactions}, Comments=${perf.comments}, Shares=${perf.shares} (Score=${perf.score})`,
      ''
    );
  }
  
  const dataContext = reportLines.join('\n');
  const prompt = `Duoi day la thong ke tuong tac thuc te tu Fanpage Lucas Combo cho cac video Reels quang cao san pham trong tuan qua.
Diem tuong tac (Score) duoc tinh bang: Reactions * 1 + Comments * 3 + Shares * 5.

DU LIEU TUONG TAC:
${dataContext}

Nhiem vu cua ban:
Phan tich du lieu tren va duc ket thanh bo huong dan cu the (style guide toi uu tuong tac) de viet lai hook line, feature bullets va caption Reels tiep theo.
Yeu cau bo huong dan:
1. Chi ra nhung san pham, dang hook hoac kieu viet lai nao mang lai tuong tac tot nhat.
2. Chi ra nhung gi dang kem hieu qua, can tranh.
3. Trinh bay cuc ky ngan gon duoi dang gach dau dong (toi da 5-8 gach dau dong), viet bang tieng Viet co dau, de dua thang vao prompt he thong cho cac lan sinh tiep theo.

Chi in ra ket qua bo huong dan duoi dang gach dau dong, tuyet doi khong viet loi mo dau hay ket thuc du thua.`;

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const learnings = response.content[0].text.trim();
    console.log('-> Da nhan phan tich Reels tu Claude:');
    console.log(learnings);
    
    await fs.writeFile(learningsFile, learnings, 'utf8');
    console.log('Da ghi learnings.txt cho Reels.');
  } catch (e) {
    console.error('Loi khi goi Claude AI:', e.message);
  }
}

main().catch(console.error);
