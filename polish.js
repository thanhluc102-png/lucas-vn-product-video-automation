// polish.js
// Dung Claude (Anthropic API) de viet lai hook line, feature bullet va caption
// Facebook cho tu nhien/muot hon, dua tren DUNG du lieu that cua san pham
// (khong bia them thong so/giam gia). Tuy chon: neu khong co ANTHROPIC_API_KEY
// trong environment, runner.js se bo qua buoc nay va dung noi dung goc.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL = 'claude-opus-4-8';

const CopySchema = z.object({
  hookLine: z.string().describe('Cau hook mo dau video, ngan gon, gay chu y, tieng Viet'),
  feature1: z.string().describe('Tinh nang noi bat 1, 1 cau ngan'),
  feature2: z.string().describe('Tinh nang noi bat 2, 1 cau ngan'),
  feature3: z.string().describe('Tinh nang noi bat 3, 1 cau ngan'),
  feature4: z.string().describe('Tinh nang noi bat 4, 1 cau ngan'),
  facebookCaption: z.string().describe('Caption dang kem video Facebook Reels, dai hơn (khoang 6-10 dong), co the dung emoji, KHONG chua link va KHONG nhac ten shop/website'),
});

function log(msg) {
  console.log(`[polish] ${msg}`);
}

function buildPrompt(props) {
  const context = {
    productName: props.productName,
    brand: props.brand,
    existingHookLine: props.hookLine,
    existingFeatures: [props.feature1, props.feature2, props.feature3, props.feature4].filter(Boolean),
    priceOriginal: props.priceOriginal,
    priceSale: props.priceSale,
    discountPercent: props.discountPercent,
    coupon: props.coupon,
    couponValue: props.couponValue,
  };

  let learnings = '';
  try {
    const learningsPath = path.join(__dirname, 'learnings.txt');
    if (fs.existsSync(learningsPath)) {
      learnings = `\n- HƯỚNG DẪN TỐI ƯU TỪ TƯƠNG TÁC THỰC TẾ HÀNG NGÀY (Cần tuân thủ nghiêm ngặt):\n${fs.readFileSync(learningsPath, 'utf8')}\n`;
    }
  } catch (e) {
    // ignore
  }

  return `Day la du lieu THAT ve 1 san pham cua Lucas.vn:
${JSON.stringify(context, null, 2)}

Viet lai hook line + 4 feature bullet cho video quang cao doc 9:16, va 1 caption Facebook Reels.

QUY TAC BAT BUOC:
- Chi duoc dung thong tin co trong du lieu tren. TUYET DOI khong bia them thong so,
  tinh nang, hay % giam gia khong co trong du lieu.
- Neu discountPercent la "0", KHONG duoc noi san pham dang giam gia hay "gia soc".
- Van phong: tieng Viet, ngan gon, tu nhien, gay chu y, phu hop content ban hang online.
- hookLine va moi feature: toi da khoang 90 ky tu.
- facebookCaption: dai hon, khoang 6-10 dong, ke chi tiet ve san pham va loi ich,
  co the dung emoji, ket bang loi keu goi mua hang chung chung (vd "Inbox ngay
  de dat hang!", "Chot don lien tay!"); neu co coupon thi nhac ma coupon.
  TUYET DOI KHONG chen link/URL san pham, va KHONG nhac ten shop hay website
  (vd "Lucas.vn") trong caption — nhung thu do se duoc dang rieng o phan binh
  luan, khong phai trong caption nay.
${learnings}`;
}

export async function polishCopy(props) {
  const client = new Anthropic(); // doc ANTHROPIC_API_KEY tu environment

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(props) }],
    output_config: { format: zodOutputFormat(CopySchema) },
  });

  const parsed = res.parsed_output;
  if (!parsed) throw new Error('Claude khong tra ve output hop le.');

  log('Da nhan noi dung polish tu Claude.');
  return parsed;
}
