// product-video.jsx — 9:16 tech-product promo template (20s).
// Reads all content from props so an automation tool can swap it daily.
// Depends on globals from animations.jsx (loaded first via x-import).

const { Stage, Sprite, useTime, useSprite, Easing, interpolate, animate, clamp } = window;

const W = 1080, H = 1920, CX = W / 2;
const DISPLAY = "'Be Vietnam Pro', system-ui, sans-serif";
const TEXT = "'Be Vietnam Pro', system-ui, sans-serif";

// Palette "Apestomen-style": nen kem sang, chu muc (ink), 1 man nen nau dam
// de doi nhip. Anh san pham nen trang hoa vao nen kem sang nen khong bi khoi
// vuong nhu khi dat tren nen den.
const CREAM = '#F7F5F1';      // nen trang nga gan trang (de anh nen trang hoa vao)
const CREAM_HI = '#FFFFFF';   // vung sang nhat o giua (gradient) — trung mau nen anh
const BROWN = '#241F18';      // nen nau dam (man price)
const INK = '#1C1915';        // chu chinh tren nen kem
const INK_SOFT = '#9A9182';   // chu phu / label tren nen kem
const WARM = '#EBC9A6';       // highlight marker (cam nhat)

// ── atoms ────────────────────────────────────────────────────────────────
function hexToRgba(hex, a) {
  const h = (hex || '#3B7DFF').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Background knockout: reads the image pixels, samples the 4 corners to find
// the background colour, then flood-fills inward from every border pixel that
// matches it (with a feather edge at the boundary). Flood-filling from the
// border — instead of testing every pixel in isolation — means a product with
// light/near-white parts (clear cases, pale grey, glossy highlights) keeps
// those parts as long as they're not actually contiguous with the border
// background; a plain per-pixel colour-distance pass would erase them too.
// Bails to the original when: cutout is off, the image is already
// transparent, or the pixels can't be read (cross-origin taint). Cached by src.
const _cutoutCache = {};
function useCutout(src, enabled, tolerance = 62) {
  const [out, setOut] = React.useState(() => _cutoutCache[src] || null);
  React.useEffect(() => {
    if (!enabled || !src) { setOut(null); return; }
    if (_cutoutCache[src] !== undefined) { setOut(_cutoutCache[src]); if (_cutoutCache[src] !== null) return; }
    let cancelled = false;
    const finish = (v) => { _cutoutCache[src] = v; if (!cancelled) setOut(v); };
    const process = (img) => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const id = x.getImageData(0, 0, w, h); const d = id.data;
        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
        let r = 0, g = 0, b = 0, a = 0;
        for (const [cx, cy] of corners) { const i = (cy * w + cx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; }
        r /= 4; g /= 4; b /= 4; a /= 4;
        if (a < 250) { finish(null); return; } // already has transparency

        const t2 = tolerance * 1.7;
        const dist = (i) => Math.sqrt((d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2);
        const n = w * h;
        const queued = new Uint8Array(n);
        const stack = [];
        const seed = (px) => {
          if (queued[px]) return;
          const i = px * 4;
          if (dist(i) < t2) { queued[px] = 1; stack.push(px); }
        };
        for (let xx = 0; xx < w; xx++) { seed(xx); seed((h - 1) * w + xx); }
        for (let yy = 0; yy < h; yy++) { seed(yy * w); seed(yy * w + (w - 1)); }

        while (stack.length) {
          const px = stack.pop();
          const xx = px % w, yy = (px / w) | 0;
          const i = px * 4;
          const dd = dist(i);
          if (dd < tolerance) d[i + 3] = 0;
          else d[i + 3] = Math.round(d[i + 3] * ((dd - tolerance) / (t2 - tolerance)));
          if (xx > 0) seed(px - 1);
          if (xx < w - 1) seed(px + 1);
          if (yy > 0) seed(px - w);
          if (yy < h - 1) seed(px + w);
        }

        x.putImageData(id, 0, 0);
        finish(c.toDataURL('image/png'));
      } catch (e) { finish(null); } // tainted / cross-origin
    };
    const ci = new Image(); ci.crossOrigin = 'anonymous';
    ci.onload = () => process(ci);
    ci.onerror = () => { const pi = new Image(); pi.onload = () => process(pi); pi.onerror = () => finish(null); pi.src = src; };
    ci.src = src;
    return () => { cancelled = true; };
  }, [src, enabled, tolerance]);
  return out;
}

function ProductImg({ src, cutout, style }) {
  const processed = useCutout(src, cutout);
  return <img src={processed || src} alt="" style={style} />;
}

// Trendy: khoi chu "truot len" tu duoi 1 lop mask (kinetic typography). Boc
// noi dung trong 1 hop overflow:hidden roi day noi dung tu duoi len.
function RevealUp({ localTime, delay = 0, dur = 0.6, children, style }) {
  const t = Easing.easeOutCubic(clamp((localTime - delay) / dur, 0, 1));
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <div style={{ transform: `translateY(${(1 - t) * 112}%)` }}>{children}</div>
    </div>
  );
}

// Count-up number driven by the enclosing Sprite's local time.
function Counter({ to, dur = 1.3, ease = Easing.easeOutExpo }) {
  const { localTime } = useSprite();
  const t = clamp(localTime / dur, 0, 1);
  const val = Math.round(to * ease(t));
  return val.toLocaleString('en-US');
}

// Persistent background: warm cream with a soft drifting light gradient (no
// grid, no neon glow). The gentle motion keeps it from looking flat/dead.
function Bg() {
  const time = useTime();
  const gx = CX + Math.cos(time * 0.28) * 90;
  const gy = 640 + Math.sin(time * 0.34) * 80;
  return (
    <div style={{ position: 'absolute', inset: 0, background: CREAM, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        background: `radial-gradient(760px 760px at ${gx}px ${gy}px, ${CREAM_HI} 0%, ${CREAM} 60%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 90% at 50% 42%, transparent 60%, rgba(90,78,60,0.10) 100%)' }} />
    </div>
  );
}

// Full-screen dark-brown panel used by one scene to break the rhythm.
// Trendy: quet (wipe) tu tren xuong thay vi fade.
function BrownPanel({ localTime }) {
  const t = Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1));
  return <div style={{ position: 'absolute', inset: 0, background: BROWN, clipPath: `inset(0 0 ${(1 - t) * 100}% 0)` }} />;
}

// Progress bar pinned to the very bottom (reels-style).
function ProgressBar({ accent }) {
  const time = useTime();
  const pct = clamp(time / 20, 0, 1) * 100;
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 8, background: 'rgba(0,0,0,0.08)' }}>
      <div style={{ width: pct + '%', height: '100%', background: accent }} />
    </div>
  );
}

// ── scene 1: HOOK ──────────────────────────────────────────────────────────
function HookScene({ p }) {
  return (
    <>
      <Sprite start={0.5} end={4.5}>
        {({ localTime }) => {
          const rise = Easing.easeOutCubic(clamp(localTime / 0.9, 0, 1));
          // Ken Burns: zoom cham lien tuc de anh khong bi "dung hinh".
          const kb = 1 + 0.06 * clamp(localTime / 4.2, 0, 1);
          const scale = (0.86 + 0.14 * rise) * kb;
          const drift = Math.sin(localTime * 0.9) * 8;
          return (
            <div style={{ position: 'absolute', inset: 0, opacity: rise }}>
              <div style={{ position: 'absolute', left: CX - 320, top: 300 + drift, width: 640, height: 640,
                transform: `scale(${scale})`, transformOrigin: 'center' }}>
                <ProductImg src={p.productImage} cutout={p.cutout} style={{ width: '100%', height: '100%', objectFit: 'contain',
                  filter: 'drop-shadow(0 34px 46px rgba(60,48,32,0.22))' }} />
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={0.15} end={4.5}>
        <div style={{ position: 'absolute', top: 150, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 30, letterSpacing: '0.32em', color: INK_SOFT }}>
            {p.brand.toUpperCase()}
          </div>
          <div style={{ width: 60, height: 3, borderRadius: 2, background: p.accent }} />
        </div>
      </Sprite>

      <Sprite start={1.5} end={4.5}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.6, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 1150, left: 0, width: W, textAlign: 'center', opacity: clamp(localTime / 0.4, 0, 1), transform: `scale(${0.8 + 0.2 * t})` }}>
              <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 30, letterSpacing: '0.28em', color: INK_SOFT }}>{p.heroLabel}</div>
              <RevealUp localTime={localTime} delay={0.15} dur={0.6} style={{ paddingBottom: 12 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 300, lineHeight: 0.9, color: INK }}>
                  <Counter to={+p.heroValue || 45} dur={1.4} /><span style={{ color: p.accent }}>{p.heroUnit}</span>
                </div>
              </RevealUp>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={2.3} end={4.5}>
        <div style={{ position: 'absolute', top: 1560, left: 80, width: W - 160, textAlign: 'center' }}>
          <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 66, lineHeight: 1.35, color: INK, letterSpacing: '-0.01em',
            background: `linear-gradient(180deg, transparent 62%, ${WARM} 62%, ${WARM} 96%, transparent 96%)`,
            boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', padding: '0 10px' }}>
            {p.hookLine}
          </span>
        </div>
      </Sprite>
    </>
  );
}

// ── scene 2: FEATURES ────────────────────────────────────────────────────────
function FeatureScene({ p, features }) {
  return (
    <>
      <Sprite start={4.5} end={11.5}>
        {({ localTime }) => {
          const t = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));
          const kb = 1 + 0.05 * clamp(localTime / 6, 0, 1);
          return (
            <div style={{ position: 'absolute', left: CX - 230, top: 150, width: 460, height: 460, opacity: t, transform: `scale(${(0.9 + 0.1 * t) * kb})` }}>
              <ProductImg src={p.productImage2} cutout={p.cutout} style={{ width: '100%', height: '100%', objectFit: 'contain',
                filter: 'drop-shadow(0 28px 40px rgba(60,48,32,0.20))' }} />
            </div>
          );
        }}
      </Sprite>

      <Sprite start={4.7} end={11.5}>
        {({ localTime }) => (
          <RevealUp localTime={localTime} dur={0.6} style={{ position: 'absolute', top: 640, left: 0, width: W }}>
            <div style={{ textAlign: 'center', fontFamily: TEXT, fontWeight: 800, fontSize: 58, color: INK, letterSpacing: '-0.01em' }}>
              Vì sao nên chọn?
            </div>
          </RevealUp>
        )}
      </Sprite>

      {features.map((f, i) => (
        <Sprite key={i} start={5.0 + i * 0.35} end={11.5}>
          {({ localTime }) => {
            const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
            return (
              <div style={{ position: 'absolute', top: 780 + i * 150, left: 70, width: W - 140,
                opacity: clamp(localTime / 0.35, 0, 1), transform: `translateX(${(1 - t) * 40}px)`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 26,
                padding: '26px 40px', borderRadius: 22,
                background: '#fff', border: '1px solid rgba(60,48,32,0.07)', boxShadow: '0 10px 26px rgba(60,48,32,0.07)' }}>
                <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 40, color: INK, lineHeight: 1.15, textAlign: 'left' }}>{f}</div>
                <div style={{ flexShrink: 0, width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: hexToRgba(p.accent, 0.14), border: `1px solid ${hexToRgba(p.accent, 0.45)}`,
                  fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: p.accent }}>{i + 1}</div>
              </div>
            );
          }}
        </Sprite>
      ))}

      <Sprite start={6.3} end={11.5}>
        {({ localTime }) => {
          const chips = (p.specChips || []).slice(0, 3).map((c) => ({
            v: <><Counter to={+c.value || 0} dur={0.4} /></>,
            u: c.unit,
          }));
          return (
            <div style={{ position: 'absolute', top: 1540, left: 70, width: W - 140, display: 'flex', gap: 20,
              opacity: clamp(localTime / 0.5, 0, 1), transform: `translateY(${(1 - Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1))) * 30}px)` }}>
              {chips.map((c, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '28px 10px', borderRadius: 22,
                  background: '#fff', border: '1px solid rgba(60,48,32,0.07)', boxShadow: '0 10px 26px rgba(60,48,32,0.07)' }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 58, color: INK }}>{c.v}</div>
                  <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 28, color: p.accent, letterSpacing: '0.1em', marginTop: 4 }}>{c.u}</div>
                </div>
              ))}
            </div>
          );
        }}
      </Sprite>
    </>
  );
}

// ── scene 3: PRICE ───────────────────────────────────────────────────────────
// Man nay dung nen NAU DAM de doi nhip (khong co anh san pham -> khong lo khoi
// vuong trang tren nen toi). Chu de mau kem sang.
function PriceScene({ p }) {
  return (
    <>
      <Sprite start={11.5} end={16.5}>
        {({ localTime }) => <BrownPanel localTime={localTime} />}
      </Sprite>

      <Sprite start={11.7} end={16.5}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 360, left: 0, width: W, textAlign: 'center',
              opacity: clamp(localTime / 0.4, 0, 1), transform: `scale(${0.85 + 0.15 * t})` }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '16px 34px', borderRadius: 100,
                background: '#FF3B5C',
                fontFamily: TEXT, fontWeight: 800, fontSize: 34, letterSpacing: '0.14em', color: '#fff' }}>
                {p.priceBadge}
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={12.2} end={16.5}>
        {({ localTime }) => {
          // Khong hien gia gach ngang neu trung voi gia ban (khong giam gia that).
          if (p.priceOriginal === p.priceSale) return null;
          return (
            <div style={{ position: 'absolute', top: 540, left: 0, width: W, textAlign: 'center',
              opacity: clamp(localTime / 0.4, 0, 1) }}>
              <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 52, color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through' }}>{p.priceOriginal}</span>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={12.55} end={16.5}>
        {({ localTime }) => {
          return (
            <RevealUp localTime={localTime} dur={0.6} style={{ position: 'absolute', top: 620, left: 0, width: W, paddingBottom: 10 }}>
              <div style={{ textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 168, lineHeight: 1, color: '#fff' }}>{p.priceSale}</div>
            </RevealUp>
          );
        }}
      </Sprite>

      <Sprite start={13.0} end={16.5}>
        {({ localTime }) => {
          // Khong hien vong tron % neu khong co giam gia that (discountPercent '0'/rong).
          if (!p.discountPercent || p.discountPercent === '0') return null;
          const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 430, left: CX + 250, transform: `scale(${t}) rotate(-10deg)`, transformOrigin: 'center',
              width: 170, height: 170, borderRadius: '50%', background: p.accent, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: DISPLAY, color: '#04122E' }}>
              <span style={{ fontWeight: 700, fontSize: 76, lineHeight: 0.9 }}>-{p.discountPercent}</span>
              <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 34 }}>%</span>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={13.6} end={16.5}>
        {({ localTime }) => {
          return (
            <div style={{ position: 'absolute', top: 900, left: 100, width: W - 200,
              opacity: clamp(localTime / 0.4, 0, 1) }}>
              <div style={{ padding: '34px 30px', borderRadius: 24, textAlign: 'center',
                border: `3px dashed ${hexToRgba(p.accent, 0.6)}`, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }}>NHẬP MÃ KHI THANH TOÁN</div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: '#fff', letterSpacing: '0.06em', margin: '6px 0' }}>{p.coupon}</div>
                <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 40, color: p.accent }}>{p.couponValue}</div>
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={14.1} end={16.5}>
        <div style={{ position: 'absolute', top: 1320, left: 90, width: W - 180, textAlign: 'center',
          fontFamily: TEXT, fontWeight: 700, fontSize: 44, lineHeight: 1.25, color: CREAM }}>
          {p.productName}
        </div>
      </Sprite>
    </>
  );
}

// ── scene 4: CTA ─────────────────────────────────────────────────────────────
function CtaScene({ p }) {
  return (
    <>
      <Sprite start={16.5} end={20}>
        {({ localTime }) => {
          const t = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));
          const kb = 1 + 0.05 * clamp(localTime / 3.4, 0, 1);
          return (
            <div style={{ position: 'absolute', left: CX - 230, top: 300, width: 460, height: 460, opacity: t, transform: `scale(${(0.9 + 0.1 * t) * kb})` }}>
              <ProductImg src={p.productImage3} cutout={p.cutout} style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain',
                filter: 'drop-shadow(0 30px 44px rgba(60,48,32,0.22))' }} />
            </div>
          );
        }}
      </Sprite>

      <Sprite start={16.8} end={20}>
        {({ localTime }) => (
          <RevealUp localTime={localTime} dur={0.6} style={{ position: 'absolute', top: 880, left: 0, width: W, paddingBottom: 8 }}>
            <div style={{ textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: INK, letterSpacing: '-0.01em' }}>
              {p.shopName}
            </div>
          </RevealUp>
        )}
      </Sprite>

      <Sprite start={17.1} end={20}>
        {({ localTime }) => {
          const pulse = 1 + 0.03 * Math.sin(localTime * 4.5);
          const t = Easing.easeOutBack(clamp(localTime / 0.6, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 1080, left: 0, width: W, display: 'flex', justifyContent: 'center',
              opacity: clamp(localTime / 0.3, 0, 1), transform: `scale(${(0.8 + 0.2 * t) * pulse})` }}>
              <div style={{ padding: '40px 90px', borderRadius: 100, background: p.accent, color: '#fff',
                fontFamily: TEXT, fontWeight: 800, fontSize: 66, letterSpacing: '0.02em' }}>
                MUA NGAY
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={17.5} end={20}>
        {({ localTime }) => {
          const ctaItems = (p.ctaLine || '')
            .split(/[•·,]+/)
            .map((s) => s.trim())
            .filter(Boolean);

          return (
            <div style={{ position: 'absolute', top: 1280, left: 60, width: W - 120,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              fontFamily: TEXT, fontWeight: 600, fontSize: 38, color: INK_SOFT }}>
              {ctaItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: p.accent, fontSize: 44, lineHeight: 1 }}>•</span>
                  {item}
                </div>
              ))}
            </div>
          );
        }}
      </Sprite>

      <Sprite start={17.8} end={20}>
        {({ localTime }) => {
          const tap = Math.abs(Math.sin(localTime * 3));
          return (
            <div style={{ position: 'absolute', top: 1180 + tap * 24, left: CX + 200, fontSize: 90, transform: 'rotate(-15deg)' }}>👆</div>
          );
        }}
      </Sprite>
    </>
  );
}

function ProductVideo(props) {
  const p = {
    accent: props.accent || '#3B7DFF',
    brand: props.brand || 'Anker',
    productName: props.productName || 'Sạc Dự Phòng Anker Nano 2C1A 45W 10000mAh A1638',
    hookLine: props.hookLine || 'Cả trạm sạc 45W gọn trong lòng bàn tay',
    productImage: props.productImage || 'https://lucas.vn/wp-content/uploads/2025/11/Sac-Du-Phong-Anker-Nano-2C1A-45W-10000mAh-A1638.png',
    productImage2: props.productImage2 || props.productImage || 'https://lucas.vn/wp-content/uploads/2025/11/Sac-Du-Phong-Anker-Nano-2C1A-45W-10000mAh-A1638.png',
    productImage3: props.productImage3 || props.productImage2 || props.productImage || 'https://lucas.vn/wp-content/uploads/2025/11/Sac-Du-Phong-Anker-Nano-2C1A-45W-10000mAh-A1638.png',
    specPower: props.specPower || '45',
    specCapacity: props.specCapacity || '10000',
    specWeight: props.specWeight || '232',
    heroLabel: props.heroLabel || 'CÔNG SUẤT SẠC',
    heroValue: props.heroValue || props.specPower || '45',
    heroUnit: props.heroUnit || 'W',
    specChips: props.specChips || [
      { value: props.specCapacity || '10000', unit: 'mAh' },
      { value: props.specPower || '45', unit: 'W' },
      { value: props.specWeight || '232', unit: 'gram' },
    ],
    priceOriginal: props.priceOriginal || '1.300.000₫',
    priceSale: props.priceSale || '1.150.000₫',
    discountPercent: props.discountPercent || '12',
    priceBadge: props.priceBadge || '🔥 GIÁ SỐC HÔM NAY',
    coupon: props.coupon || 'LUCAS79K',
    couponValue: props.couponValue || 'Giảm thêm 79.000đ',
    cutout: props.cutout === undefined ? false : (props.cutout === 'false' ? false : !!props.cutout),
    shopName: props.shopName || 'Lucas.vn',
    ctaLine: props.ctaLine || 'Freeship nội thành • Chính hãng 100% • Đổi trả 30 ngày',
  };
  const features = [props.feature1, props.feature2, props.feature3, props.feature4]
    .filter(Boolean);
  const feats = features.length ? features : [
    'Sạc nhanh 45W cho cả laptop',
    'Cáp USB-C tích hợp, kéo ra thu vào',
    'Màn hình thông minh, bảo vệ pin 24/7',
    'Nhỏ gọn hơn 16%, bỏ túi dễ dàng',
  ];

  return (
    <Stage width={W} height={H} duration={20} background={CREAM} persistKey="anker-promo">
      <Sprite start={0} end={20} keepMounted><Bg /></Sprite>
      <HookScene p={p} />
      <FeatureScene p={p} features={feats} />
      <PriceScene p={p} />
      <CtaScene p={p} />
      <Sprite start={0} end={20} keepMounted><ProgressBar accent={p.accent} /></Sprite>
    </Stage>
  );
}

window.ProductVideo = ProductVideo;
