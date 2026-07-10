# Bàn giao: Tool tự động dựng video sản phẩm (9:16, 20s)

> Gói này dành cho **bạn (dev) + Claude Code**. Mục tiêu: mỗi ngày tự động sinh ra video quảng cáo
> sản phẩm từ dữ liệu web lucas.vn (WordPress/WooCommerce) mà không cần bấm tay.
>
> **Cách dùng nhanh:** mở thư mục này bằng Claude Code, dán "PROMPT CHO CLAUDE CODE" ở cuối file,
> Claude Code sẽ dựng bộ render tự động dựa trên spec bên dưới.

---

## 1. Đây là gì

`template/` chứa một **template video HTML chạy được trong trình duyệt**. Nó là 1 animation 20 giây,
tỉ lệ dọc 1080×1920 (TikTok/Reels/Shorts), mạch: **Hook → Tính năng → Giá sốc → CTA**. Toàn bộ nội dung
(tên, ảnh, giá, %, mã giảm, tính năng, thông số…) đều là **biến truyền vào**, nên chỉ cần đổi dữ liệu là
ra video sản phẩm khác.

Đây **không phải** code cần viết lại — hãy dùng đúng template này, chỉ cần dựng phần **bơm dữ liệu + render ra MP4 tự động**.

## 2. Kiến trúc tổng thể (luồng chạy mỗi ngày)

```
[WooCommerce Store API]  ──(fetch JSON)──►  runner.js
        lucas.vn                                │
                                                ├─► tải ảnh sản phẩm về  ►  frames/product.png  (BẮT BUỘC là ảnh local)
                                                │
                                                ├─► mapWooProduct(json)  ►  object props  (dùng template/map-product.js)
                                                │
                                                └─► mở template trong trình duyệt (Puppeteer)
                                                        với dữ liệu đã bơm vào
                                                             │
                                          chụp từng frame (600 frame @30fps) ─► ffmpeg ─► video.mp4
```

## 3. Các file trong gói

- `template/video-template.dc.html` — file template chính, mở trực tiếp trong trình duyệt là chạy.
- `template/support.js` — runtime của template (phải nằm cùng thư mục).
- `template/animations.jsx` — engine timeline (Stage/Sprite, seek, xuất video).
- `template/product-video.jsx` — nội dung animation + logic **tách nền** ảnh.
- `template/map-product.js` — hàm `mapWooProduct(json, opts)` đổi JSON API → object props.
- `template/images/product.png` — ảnh mẫu (Anker), để runner ghi đè mỗi lần chạy.

## 4. Cách bơm dữ liệu vào template

Template nhận dữ liệu theo 2 cách (giá trị bơm vào **đè** giá trị mặc định):

1. **Query URL:** `video-template.dc.html?data=<BASE64 của chuỗi JSON>`
2. **Biến toàn cục:** đặt `window.__PRODUCT__ = {...}` **trước khi** template render.

### Danh sách trường (props) template hiểu

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| `brand` | Tên hãng (chip trên cùng) | `"Anker"` |
| `shopName` | Tên shop (màn CTA) | `"Lucas.vn"` |
| `accent` | Màu nhấn (hex) | `"#3B7DFF"` |
| `cutout` | Tự tách nền trắng ảnh (true/false) | `true` |
| `productName` | Tên sản phẩm đầy đủ | `"Sạc Dự Phòng Anker Nano…"` |
| `productImage` | **Đường dẫn ảnh LOCAL** (xem mục 6) | `"images/product.png"` |
| `hookLine` | Câu hook mở đầu | `"Cả trạm sạc 45W…"` |
| `feature1..4` | 4 tính năng nổi bật | `"Sạc nhanh 45W…"` |
| `specCapacity` | Dung lượng (chỉ số, để đếm) | `"10000"` |
| `specPower` | Công suất (chỉ số) | `"45"` |
| `specWeight` | Trọng lượng (chỉ số) | `"232"` |
| `priceOriginal` | Giá gốc (có gạch ngang) | `"1.300.000₫"` |
| `priceSale` | Giá bán | `"1.150.000₫"` |
| `discountPercent` | % giảm (chỉ số) | `"12"` |
| `coupon` | Mã giảm | `"LUCAS79K"` |
| `couponValue` | Mô tả ưu đãi | `"Giảm thêm 79.000đ"` |
| `ctaLine` | Dòng chữ dưới nút Mua ngay | `"Freeship • Chính hãng 100%…"` |

Trường nào để trống → template dùng giá trị mặc định.

## 5. Lấy dữ liệu từ WordPress/WooCommerce

Store API công khai (chỉ đọc, không cần key):

```
GET https://lucas.vn/wp-json/wc/store/v1/products/{id}
```

Sản phẩm mẫu (Anker A1638) có `id = 52232`:
`https://lucas.vn/wp-json/wc/store/v1/products/52232`

Đổi JSON → props bằng hàm có sẵn:

```js
import { mapWooProduct } from './template/map-product.js';

const json  = await fetch('https://lucas.vn/wp-json/wc/store/v1/products/52232').then(r => r.json());
const props = mapWooProduct(json, {
  shopName: 'Lucas.vn',
  accent: '#3B7DFF',
  coupon: 'LUCAS79K',
  couponValue: 'Giảm thêm 79.000đ',
  productImageLocalPath: 'images/product.png', // sau khi đã tải ảnh về (mục 6)
});
```

> Lưu ý: cần kiểm tra tên trường `attributes` thực tế (vd "Dung lượng", "Công suất", "Trọng lượng") để
> `specCapacity/specPower/specWeight` map đúng; nếu khác, sửa từ khoá trong `map-product.js` hàm `findAttr`.
> Nếu Store API tắt, dùng WooCommerce REST API `/wp-json/wc/v3/products/{id}` (cần consumer key/secret) — cấu trúc trường tương tự.

## 6. ⚠️ Điểm mấu chốt: ẢNH PHẢI LÀ FILE LOCAL

Ảnh để link `https://lucas.vn/...` sẽ **bị mất khi render video** (trình duyệt chặn đọc ảnh khác domain — CORS),
và cũng **không tách nền được**. Vì vậy runner PHẢI:

1. Đọc `json.images[0].src` (link ảnh gốc).
2. **Tải file ảnh đó về** đặt cạnh template, vd `template/images/product.png`.
3. Đặt `productImage = 'images/product.png'` (đường dẫn tương đối tới template).

Chạy server-side (Node fetch/axios) tải ảnh thì **không** dính CORS. Khi ảnh là local, template tự
tách nền trắng (nếu `cutout: true`) và render không mất ảnh.

## 7. Render template ra MP4 (Puppeteer + ffmpeg)

Template đã có sẵn "hợp đồng xuất video": phần tử `<svg>` bên trong lắng nghe sự kiện tua và render đúng
mốc thời gian đó. Thông số cố định: **rộng 1080, cao 1920, dài 20 giây**.

Quy trình runner nên làm:

1. **Serve thư mục `template/` qua HTTP** (vd `npx http-server template -p 8080`) — không dùng `file://`
   vì template nạp `support.js` và các `.jsx` bằng đường dẫn tương đối.
2. Puppeteer mở: `http://localhost:8080/video-template.dc.html?data=<base64(JSON props)>`
   - Set viewport đủ lớn (vd 1160×2040) để animation không bị thu nhỏ.
3. Chờ sẵn sàng: đợi `<svg[data-om-fonts-inlined]>` xuất hiện + delay ~800ms (để font + tách nền xong).
4. Ép svg về đúng tỉ lệ 1:1 để chụp nét:
   ```js
   await page.evaluate(() => { const s=document.querySelector('svg'); s.style.transform='none'; });
   const svg = await page.$('svg');
   ```
5. Chụp từng frame (30fps × 20s = 600 frame). Với mỗi frame `i`:
   ```js
   const t = i / 30;
   await page.evaluate((t) => {
     document.querySelector('svg').dispatchEvent(
       new CustomEvent('data-om-seek-to-time-frame', { detail: { time: t, frame: 0 } })
     );
   }, t);
   await new Promise(r => setTimeout(r, 30));      // để React render mốc đó
   await svg.screenshot({ path: `frames/f${String(i).padStart(4,'0')}.png` });
   ```
6. Ghép video:
   ```
   ffmpeg -y -framerate 30 -i frames/f%04d.png -c:v libx264 -pix_fmt yuv420p -movflags +faststart video.mp4
   ```
7. (Tuỳ chọn) ghép nhạc nền: `ffmpeg -i video.mp4 -i beat.mp3 -shortest -c:v copy -c:a aac final.mp4`.

> Cách khác gọn hơn nếu muốn: dùng **puppeteer-screen-recorder** quay lại đúng 20s trong khi template tự chạy —
> nhưng cách chụp-từng-frame ở trên cho chất lượng ổn định và đúng fps hơn.

## 8. Chạy hằng ngày

Bọc runner thành script (vd `node runner.js --id 52232`) rồi lên lịch:

- **cron** (Linux/Mac): `0 8 * * * cd /path && node runner.js --id 52232`
- hoặc **GitHub Actions** theo lịch `schedule`.
- Danh sách sản phẩm cần dựng để trong 1 file (vd `products.json`) rồi lặp qua.

Đăng tự động lên TikTok/YouTube là bước riêng (dùng API nền tảng tương ứng) — không nằm trong template này.

---

## 9. `runner.js` — đã dựng xong, cách cài & chạy

Tool tự động đã được dựng tại [runner.js](runner.js) theo đúng spec ở mục 1–8. Nó **không sửa gì
trong `template/`**, chỉ bơm dữ liệu (ảnh + props) rồi mở template bằng Puppeteer để render MP4.

### 9.1. Cài đặt

Yêu cầu: Node.js ≥ 18 (đã test với Node 25), và **ffmpeg** có sẵn trong `PATH`.

```bash
# ffmpeg (macOS)
brew install ffmpeg

# Cài puppeteer (tự tải kèm 1 bản Chrome headless riêng, ~200MB)
npm install
```

### 9.2. Chạy thủ công

```bash
node runner.js --id 52232      # mặc định id=52232 nếu không truyền
node runner.js --id=12345      # cũng chấp nhận dạng --id=xxx
```

Runner sẽ:
1. Gọi `GET https://lucas.vn/wp-json/wc/store/v1/products/{id}`.
2. Tải `images[0].src` về `template/images/product.png` (ghi đè).
3. Dựng props qua `mapWooProduct()` (accent `#3B7DFF`, coupon `LUCAS79K`, couponValue
   `Giảm thêm 79.000đ`).
4. Serve `template/` qua HTTP nội bộ (port ngẫu nhiên, tự đóng khi xong).
5. Puppeteer mở template, tua qua 600 frame (30fps × 20s), chụp `<svg>` từng frame.
6. Ghép frame → MP4 bằng ffmpeg (H.264, 1080×1920, `+faststart`).
7. Lưu kết quả tại `out/{id}-{yyyymmdd}.mp4` (vd `out/52232-20260709.mp4`).

Log tiến trình in ra console theo từng bước; nếu lỗi ở bước nào, script dừng và in traceback,
đồng thời luôn dọn thư mục frame tạm (`os.tmpdir()`) dù thành công hay thất bại.

> Ảnh trong `template/images/product.png` sẽ bị **ghi đè** mỗi lần chạy — đây là hành vi mong muốn
> theo README mục 6 (ảnh phải là file local để tránh CORS và để tách nền chạy được).

### 9.3. Chạy nhiều sản phẩm / cron hằng ngày

Ví dụ `products.json`:

```json
[52232, 51890, 51203]
```

Wrapper `run-all.sh`:

```bash
#!/bin/bash
cd /path/to/design_handoff_video_automation || exit 1
for id in $(cat products.json | tr -d '[],'); do
  node runner.js --id "$id" >> out/runner.log 2>&1
done
```

Đăng ký cron (macOS/Linux), chạy mỗi ngày lúc 8:00 sáng:

```bash
crontab -e
# thêm dòng:
0 8 * * * cd /path/to/design_handoff_video_automation && /usr/local/bin/node runner.js --id 52232 >> out/runner.log 2>&1
```

Lưu ý khi dùng cron:
- Dùng **đường dẫn tuyệt đối** tới `node` (kiểm tra bằng `which node`) vì cron không load `PATH`
  đầy đủ như shell tương tác.
- Đảm bảo `ffmpeg` cũng nằm trong `PATH` mà cron thấy được, hoặc set `PATH` tường minh đầu crontab:
  `PATH=/usr/local/bin:/usr/bin:/bin`.
- Trên macOS, cron cần cấp quyền Full Disk Access cho `/usr/sbin/cron` (System Settings → Privacy &
  Security) để ghi file vào thư mục Dropbox/Downloads.
- Muốn chạy nhiều sản phẩm mỗi ngày: gọi `run-all.sh` từ cron thay vì gọi `runner.js` trực tiếp.

### 9.4. Nhạc nền

`assets/bgm.m4a` là nhạc nền mặc định, tự động trộn vào video (lặp lại nếu ngắn hơn 20s, cắt vừa
đúng độ dài video, fade-out 1s cuối). Muốn đổi nhạc: thay file `assets/bgm.m4a` bằng track khác
(giữ nguyên tên file, hoặc sửa `bgmPath` trong `encodeVideo()` ở `runner.js`). Nếu xoá file này đi,
runner tự động render video không có nhạc (không lỗi).

> ⚠️ Chỉ dùng nhạc mà bạn có quyền sử dụng công khai (đã mua bản quyền, tự sáng tác, hoặc lấy từ thư
> viện royalty-free) — video đăng công khai lên Facebook Page kinh doanh nên tránh nhạc có bản quyền
> chưa xin phép.

### 9.5. Đăng tự động lên TikTok/YouTube

Không nằm trong phạm vi tool này (xem mục 8) — cần tích hợp riêng theo API từng nền tảng.

---

## PROMPT CHO CLAUDE CODE (dán nguyên đoạn này)

```
Đọc README.md trong thư mục này. Tôi cần bạn dựng một tool Node.js tên `runner.js` để tự động
sinh video quảng cáo sản phẩm từ WooCommerce Store API của lucas.vn, dùng template có sẵn trong
thư mục `template/`. KHÔNG sửa nội dung template; chỉ bơm dữ liệu và render.

Yêu cầu `runner.js`:
1. Nhận tham số --id (product id, mặc định 52232).
2. Fetch https://lucas.vn/wp-json/wc/store/v1/products/{id}.
3. Tải ảnh json.images[0].src về template/images/product.png (server-side, ghi đè).
4. Dùng mapWooProduct() trong template/map-product.js để tạo object props,
   với productImageLocalPath='images/product.png', coupon='LUCAS79K',
   couponValue='Giảm thêm 79.000đ', accent='#3B7DFF'.
5. Serve thư mục template/ qua HTTP, mở bằng Puppeteer:
   video-template.dc.html?data=<base64(JSON.stringify(props))>
6. Render ra MP4 1080x1920, 30fps, 20s theo đúng mục 7 của README
   (dispatch sự kiện 'data-om-seek-to-time-frame' cho từng frame rồi screenshot phần tử <svg>,
   sau đó ghép bằng ffmpeg).
7. Kết quả lưu out/{id}-{yyyymmdd}.mp4.
Thêm README hướng dẫn cài (puppeteer, ffmpeg) và cách lên lịch cron chạy hằng ngày.
Kiểm tra chạy thật với id 52232 và cho tôi xem video ra đúng chưa.
```
