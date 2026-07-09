# Hướng dẫn lấy Facebook Page Access Token cho auto-post Reels

`runner.js` sau khi render xong video sẽ tự đăng lên **Facebook Page Reels** qua Meta Graph API
(xem [publishers/facebook.js](publishers/facebook.js)) nếu có đủ 2 biến môi trường:

- `FB_PAGE_ID` — id của Facebook Page
- `FB_PAGE_ACCESS_TOKEN` — Page Access Token dài hạn

Nếu thiếu 1 trong 2, runner vẫn render video bình thường, chỉ bỏ qua bước đăng (an toàn cho local test).

> Vì runner tự upload video bằng byte trực tiếp (`rupload.facebook.com`), **không cần host video ở
> đâu công khai** — đúng như yêu cầu "không cần lưu video, chỉ cần đăng lên social".

---

## Bước 1 — Tạo Meta App

1. Vào https://developers.facebook.com/apps → **Create App**.
2. Chọn loại app **"Business"**.
3. Đặt tên bất kỳ (vd "Lucas Video Automation"), liên kết với Business Portfolio của bạn (tạo mới nếu chưa có).
4. Sau khi tạo xong, vào **App settings → Basic** để lấy **App ID** và **App Secret** (cần ở bước 3).

## Bước 2 — Lấy User Access Token với đúng quyền

1. Vào https://developers.facebook.com/tools/explorer/.
2. Ở góc trên bên phải, chọn đúng **App** vừa tạo ở Bước 1.
3. Chọn **User Token**, bấm **Add Permission**, thêm 3 quyền:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
4. Bấm **Generate Access Token**, đăng nhập bằng tài khoản Facebook cá nhân **đang là admin của
   Facebook Page** (Page dùng để đăng Reels).
5. Copy token vừa sinh ra (chỉ sống ~1-2 giờ, sẽ đổi thành dài hạn ở bước sau).

> Vì đây là app riêng bạn dùng để quản lý Page của chính mình, các quyền trên chỉ cần **Standard
> Access** — không cần chờ Meta App Review (App Review chỉ bắt buộc nếu muốn dùng app cho Page/tài
> khoản người khác).

## Bước 3 — Đổi sang Long-Lived User Token (~60 ngày)

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token" \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=<APP_ID>" \
  --data-urlencode "client_secret=<APP_SECRET>" \
  --data-urlencode "fb_exchange_token=<TOKEN_TU_BUOC_2>"
```

Response trả về `access_token` mới — đây là **long-lived user token**.

## Bước 4 — Lấy Page Access Token (không hết hạn)

```bash
curl -s "https://graph.facebook.com/v21.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>"
```

Response là danh sách Page bạn quản lý, mỗi Page có sẵn field `access_token` — **đây chính là
`FB_PAGE_ACCESS_TOKEN`** cần dùng. Token này lấy từ long-lived user token nên về cơ bản không hết
hạn (chỉ mất hiệu lực nếu bạn đổi mật khẩu, gỡ app, hoặc thu hồi quyền admin Page).

Field `id` trong cùng object chính là **`FB_PAGE_ID`**.

## Bước 5 — Test thử bằng tay (khuyến nghị trước khi tự động hoá)

```bash
FB_PAGE_ID=xxx FB_PAGE_ACCESS_TOKEN=yyy node runner.js --id 52232
```

Nếu thấy log `[facebook] Da dang! post_id=...` là thành công — vào Facebook Page kiểm tra tab Reels.

## Bước 6 — Add vào GitHub Secrets

```bash
gh secret set FB_PAGE_ID --body "xxx"
gh secret set FB_PAGE_ACCESS_TOKEN --body "yyy"
```

Hoặc qua giao diện: repo → **Settings → Secrets and variables → Actions → New repository secret**.

Sau khi set xong, workflow `.github/workflows/daily-reel.yml` (chạy cron hằng ngày hoặc bấm
**Run workflow** thủ công trong tab Actions) sẽ tự động render + đăng video mỗi ngày.

---

## Giới hạn cần biết

- **Chỉ đăng được vào Facebook Page**, không đăng được vào tài khoản cá nhân hay Group.
- **Rate limit**: tối đa 30 post/24h qua API cho mỗi Page.
- Nếu sau này muốn đăng cho Page **không phải do bạn quản lý** (vd chạy hộ khách hàng khác), Meta sẽ
  yêu cầu **App Review** cho 3 quyền ở Bước 2 — có thể mất vài ngày đến vài tuần để duyệt.
- Long-lived Page token về lý thuyết không hết hạn, nhưng nếu gặp lỗi `190 Invalid OAuth token` khi
  chạy cron, lặp lại Bước 2–4 để lấy token mới.
