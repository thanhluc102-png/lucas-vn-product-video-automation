// map-product.js
// Chuyển 1 product JSON từ WooCommerce Store API (GET /wp-json/wc/store/v1/products/{id})
// thành object props cho component "Video sản phẩm.dc.html".
//
// Dùng trong tool automation (Node hoặc trình duyệt):
//   import { mapWooProduct } from './map-product.js';
//   const res  = await fetch('https://lucas.vn/wp-json/wc/store/v1/products/52232').then(r => r.json());
//   const props = mapWooProduct(res, {
//     shopName: 'Lucas.vn',
//     accent: '#3B7DFF',
//     coupon: 'LUCAS79K',
//     couponValue: 'Giảm thêm 79.000đ',
//     ctaLine: 'Freeship nội thành • Chính hãng 100% • Đổi trả 30 ngày',
//     // Ảnh: tool đã tải images[0].src về và lưu nội bộ -> truyền đường dẫn local:
//     productImageLocalPath: 'images/sp.png',
//   });
//   // -> props đưa vào data-props / dc-props của component. Vì ảnh là local nên
//   //    xuất MP4 không mất ảnh và cutout (tách nền) chạy được.

// Store API trả prices dạng "minor units" (chuỗi số nguyên) + currency_minor_unit.
// VND thường minor_unit = 0 -> "1150000". Hàm này tự format có dấu chấm + ₫.
function formatMoney(minorStr, prices) {
  if (minorStr == null || minorStr === '') return '';
  const unit = Number(prices?.currency_minor_unit ?? 0);
  const n = Number(minorStr) / Math.pow(10, unit);
  const prefix = prices?.currency_prefix ?? '';
  const suffix = prices?.currency_suffix ?? '₫';
  const grouped = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${prefix}${grouped}${suffix}`;
}

// Bỏ thẻ HTML, gom khoảng trắng.
function stripHtml(html) {
  return String(html || '')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Lấy tối đa 4 bullet từ short_description (mỗi dòng/li là 1 tính năng).
function extractFeatures(shortDesc) {
  return stripHtml(shortDesc)
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

// Tìm 1 attribute theo tên gần đúng (vd "Dung lượng", "Công suất", "Trọng lượng").
function findAttr(attributes, ...keywords) {
  const list = attributes || [];
  for (const a of list) {
    const name = (a.name || '').toLowerCase();
    if (keywords.some(k => name.includes(k))) {
      const terms = (a.terms || []).map(t => t.name).join(', ');
      return terms || a.value || '';
    }
  }
  return '';
}

// Chỉ giữ chữ số (vd "10.000 mAh" -> "10000") cho hiệu ứng đếm số.
function digitsOnly(s) {
  const d = String(s || '').replace(/[^\d]/g, '');
  return d || '';
}

// Bo dau + thuong hoa de so khop tu khoa khong phan biet dau/hoa-thuong.
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CHARGER_KEYWORDS = ['sac', 'pin du phong', 'pin sac', 'adapter', 'cu sac', 'nguon'];

// San pham thuoc nhom sac/pin du phong thi giu nguyen noi dung "cong suat sac"
// (mAh/W/gram) cua template. San pham khac (op lung, cap, tai nghe...) khong co
// thong so tuong tu nen dung noi dung trung thuc hon: gia + % giam that + chinh
// sach cua shop (thay vi bia so lieu khong lien quan).
function isChargerProduct(product) {
  const cats = (product.categories || []).map((c) => `${c.name || ''} ${c.slug || ''}`).join(' ');
  const haystack = normalize(`${cats} ${product.name || ''}`);
  return CHARGER_KEYWORDS.some((k) => haystack.includes(k));
}

export function mapWooProduct(product, opts = {}) {
  const p = product || {};
  const prices = p.prices || {};

  const regular = formatMoney(prices.regular_price, prices);
  const sale = formatMoney(prices.sale_price || prices.price, prices);

  // % giảm
  let discountPercent = '';
  const reg = Number(prices.regular_price), sal = Number(prices.sale_price || prices.price);
  if (reg > 0 && sal > 0 && sal < reg) discountPercent = String(Math.round((1 - sal / reg) * 100));
  const hasDiscount = discountPercent !== '';

  const features = extractFeatures(p.short_description);

  // Thông số: ưu tiên attributes, có thể để tool ghi đè.
  const capacity = digitsOnly(opts.specCapacity || findAttr(p.attributes, 'dung lượng', 'capacity') || '');
  const power = digitsOnly(opts.specPower || findAttr(p.attributes, 'công suất', 'power', 'watt') || '');
  const weight = digitsOnly(opts.specWeight || findAttr(p.attributes, 'trọng lượng', 'weight') || '');

  // Man Hook + dai thong so cua template von thiet ke rieng cho sac/pin du
  // phong (mAh/W/gram). San pham khac khong co thong so tuong duong nen dung
  // noi dung trung thuc dua tren du lieu that: gia + % giam that + chinh sach
  // shop — thay vi hien mAh/W/gram bia dat cho 1 chiec op lung/cap sac...
  const charger = isChargerProduct(p);
  let heroLabel, heroValue, heroUnit, specChips;
  if (charger) {
    heroLabel = 'CÔNG SUẤT SẠC';
    heroValue = power || '45';
    heroUnit = 'W';
    specChips = [
      { value: capacity || '10000', unit: 'mAh' },
      { value: power || '45', unit: 'W' },
      { value: weight || '232', unit: 'gram' },
    ];
  } else {
    const salePriceNumber = Number(prices.sale_price || prices.price || 0) / Math.pow(10, Number(prices.currency_minor_unit ?? 0));
    // "SỐC" (hot deal) chi noi khi co giam gia that — tranh gay hieu nham
    // rang san pham dang khuyen mai trong khi thuc te khong giam dong nao.
    heroLabel = hasDiscount ? 'GIÁ SỐC CHỈ TỪ' : 'GIÁ CHỈ TỪ';
    heroValue = String(Math.max(1, Math.round(salePriceNumber / 1000)) || 0);
    heroUnit = 'K';
    specChips = [
      { value: discountPercent || '0', unit: '% GIẢM' },
      { value: '100', unit: '% CHÍNH HÃNG' },
      { value: '30', unit: 'NGÀY ĐỔI TRẢ' },
    ];
  }

  // Nhan "GIÁ SỐC HÔM NAY" chi dung khi co giam gia that; khong thi doi sang
  // 1 tuyen bo trung thuc khac (chinh sach that cua shop) de khong tao cam
  // giac dang khuyen mai gia.
  const priceBadge = hasDiscount ? '🔥 GIÁ SỐC HÔM NAY' : '✅ CHÍNH HÃNG 100%';

  return {
    brand: opts.brand || (p.brands && p.brands[0] && p.brands[0].name) || '',
    shopName: opts.shopName || 'Lucas.vn',
    accent: opts.accent || '#3B7DFF',
    cutout: opts.cutout !== undefined ? opts.cutout : true,

    productName: p.name || '',
    // QUAN TRỌNG: dùng ảnh LOCAL (tool tự tải images[0].src về) để xuất không mất ảnh.
    productImage: opts.productImageLocalPath || (p.images && p.images[0] && p.images[0].src) || '',
    hookLine: opts.hookLine || features[0] || p.name || '',

    feature1: features[0] || '',
    feature2: features[1] || '',
    feature3: features[2] || '',
    feature4: features[3] || '',

    specCapacity: capacity,
    specPower: power,
    specWeight: weight,
    heroLabel: opts.heroLabel || heroLabel,
    heroValue: opts.heroValue || heroValue,
    heroUnit: opts.heroUnit || heroUnit,
    specChips: opts.specChips || specChips,

    priceOriginal: regular,
    priceSale: sale,
    // '0' thay vi '' de template khong fallback nham ve so % demo mac dinh
    // (xem product-video.jsx) khi san pham thuc su khong giam gia.
    discountPercent: discountPercent || '0',
    priceBadge: opts.priceBadge || priceBadge,
    coupon: opts.coupon || '',
    couponValue: opts.couponValue || '',
    ctaLine: opts.ctaLine || 'Freeship nội thành • Chính hãng 100% • Đổi trả 30 ngày',

    // Tham khảo: link ảnh gốc trên server (dùng để tool tải về).
    _sourceImageUrl: (p.images && p.images[0] && p.images[0].src) || '',
  };
}
