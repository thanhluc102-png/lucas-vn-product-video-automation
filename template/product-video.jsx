// product-video.jsx — 9:16 tech-product promo template (20s).
// Reads all content from props so an automation tool can swap it daily.
// Depends on globals from animations.jsx (loaded first via x-import).

const { Stage, Sprite, useTime, useSprite, Easing, interpolate, animate, clamp } = window;

const W = 1080, H = 1920, CX = W / 2;
const DISPLAY = "'Space Grotesk', 'Be Vietnam Pro', sans-serif";
const TEXT = "'Be Vietnam Pro', system-ui, sans-serif";

// ── atoms ────────────────────────────────────────────────────────────────
function hexToRgba(hex, a) {
  const h = (hex || '#3B7DFF').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Background knockout: reads the image pixels, samples the 4 corners to find
// the background colour, and makes matching pixels transparent (with a feather
// edge). Bails to the original when: cutout is off, the image is already
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
        for (let i = 0; i < d.length; i += 4) {
          const dist = Math.sqrt((d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2);
          if (dist < tolerance) d[i + 3] = 0;
          else if (dist < t2) d[i + 3] = Math.round(d[i + 3] * ((dist - tolerance) / (t2 - tolerance)));
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

// Count-up number driven by the enclosing Sprite's local time.
function Counter({ to, dur = 1.3, ease = Easing.easeOutExpo }) {
  const { localTime } = useSprite();
  const t = clamp(localTime / dur, 0, 1);
  const val = Math.round(to * ease(t));
  return val.toLocaleString('en-US');
}

// Persistent background: deep gradient, drifting accent glow, faint grid, vignette.
function Bg({ accent }) {
  const time = useTime();
  const gy = 780 + Math.sin(time * 0.5) * 70;
  const gx = CX + Math.cos(time * 0.38) * 60;
  const gridY = (time * 14) % 60;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#090A0E 0%,#0C0E15 55%,#080910 100%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5,
        background: `radial-gradient(720px 720px at ${gx}px ${gy}px, ${hexToRgba(accent, 0.30)} 0%, ${hexToRgba(accent, 0.10)} 32%, transparent 62%)` }} />
      <div style={{ position: 'absolute', inset: '-60px 0', transform: `translateY(${gridY}px)`, opacity: 0.055,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px,transparent 1px)', backgroundSize: '100% 60px' }} />
      <div style={{ position: 'absolute', inset: '0 -60px', opacity: 0.04,
        backgroundImage: 'linear-gradient(90deg,rgba(255,255,255,.9) 1px,transparent 1px)', backgroundSize: '60px 100%' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  );
}

// Rotating glow ring behind the product.
function GlowRing({ accent, size, cx, cy }) {
  const time = useTime();
  return (
    <div style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size,
      transform: `rotate(${time * 22}deg)`, borderRadius: '50%',
      background: `conic-gradient(from 0deg, transparent 0deg, ${hexToRgba(accent, 0.0)} 40deg, ${hexToRgba(accent, 0.55)} 120deg, transparent 200deg, ${hexToRgba(accent, 0.35)} 300deg, transparent 360deg)`,
      filter: 'blur(26px)', opacity: 0.9 }} />
  );
}

// Progress bar pinned to the very bottom (reels-style).
function ProgressBar({ accent }) {
  const time = useTime();
  const pct = clamp(time / 20, 0, 1) * 100;
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 8, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ width: pct + '%', height: '100%', background: accent, boxShadow: `0 0 18px ${hexToRgba(accent, 0.9)}` }} />
    </div>
  );
}

// ── scene 1: HOOK ──────────────────────────────────────────────────────────
function HookScene({ p }) {
  return (
    <>
      <Sprite start={0.5} end={4.7}>
        {({ localTime }) => {
          const rise = Easing.easeOutCubic(clamp(localTime / 0.9, 0, 1));
          const scale = 0.86 + 0.14 * rise;
          const drift = Math.sin(localTime * 0.9) * 8;
          return (
            <div style={{ position: 'absolute', inset: 0, opacity: rise }}>
              <GlowRing accent={p.accent} size={860} cx={CX} cy={620} />
              <div style={{ position: 'absolute', left: CX - 320, top: 300 + drift, width: 640, height: 640,
                transform: `scale(${scale})`, transformOrigin: 'center' }}>
                <ProductImg src={p.productImage} cutout={p.cutout} style={{ width: '100%', height: '100%', objectFit: 'contain',
                  filter: `drop-shadow(0 40px 80px ${hexToRgba(p.accent, 0.45)})` }} />
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={0.15} end={4.7}>
        <div style={{ position: 'absolute', top: 150, left: 0, width: W, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 26px', borderRadius: 100,
            border: `1px solid ${hexToRgba(p.accent, 0.5)}`, background: hexToRgba(p.accent, 0.10),
            fontFamily: TEXT, fontWeight: 700, fontSize: 30, letterSpacing: '0.16em', color: '#EAF0FF' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.accent, boxShadow: `0 0 16px ${p.accent}` }} />
            {p.brand.toUpperCase()}
          </div>
        </div>
      </Sprite>

      <Sprite start={1.5} end={4.7}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.6, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 1150, left: 0, width: W, textAlign: 'center', opacity: clamp(localTime / 0.4, 0, 1), transform: `scale(${0.8 + 0.2 * t})` }}>
              <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 30, letterSpacing: '0.28em', color: hexToRgba('#FFFFFF', 0.55) }}>{p.heroLabel}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 300, lineHeight: 0.9, color: '#fff',
                textShadow: `0 0 60px ${hexToRgba(p.accent, 0.8)}` }}>
                <Counter to={+p.heroValue || 45} dur={1.4} /><span style={{ color: p.accent }}>{p.heroUnit}</span>
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={2.3} end={4.7}>
        <div style={{ position: 'absolute', top: 1560, left: 80, width: W - 160, textAlign: 'center',
          fontFamily: TEXT, fontWeight: 800, fontSize: 66, lineHeight: 1.08, color: '#F4F6FA', letterSpacing: '-0.01em' }}>
          {p.hookLine}
        </div>
      </Sprite>
    </>
  );
}

// ── scene 2: FEATURES ────────────────────────────────────────────────────────
function FeatureScene({ p, features }) {
  return (
    <>
      <Sprite start={5.0} end={11.2}>
        {({ localTime }) => {
          const t = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));
          return (
            <div style={{ position: 'absolute', left: CX - 230, top: 150, width: 460, height: 460, opacity: t, transform: `scale(${0.9 + 0.1 * t})` }}>
              <ProductImg src={p.productImage} cutout={p.cutout} style={{ width: '100%', height: '100%', objectFit: 'contain',
                filter: `drop-shadow(0 30px 60px ${hexToRgba(p.accent, 0.4)})` }} />
            </div>
          );
        }}
      </Sprite>

      <Sprite start={5.2} end={11.2}>
        <div style={{ position: 'absolute', top: 640, left: 0, width: W, textAlign: 'center',
          fontFamily: TEXT, fontWeight: 800, fontSize: 58, color: '#fff', letterSpacing: '-0.01em' }}>
          Vì sao nên chọn?
        </div>
      </Sprite>

      {features.map((f, i) => (
        <Sprite key={i} start={5.7 + i * 0.55} end={11.2}>
          {({ localTime }) => {
            const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
            return (
              <div style={{ position: 'absolute', top: 780 + i * 150, left: 70, width: W - 140,
                opacity: clamp(localTime / 0.35, 0, 1), transform: `translateX(${(1 - t) * 40}px)`,
                display: 'flex', alignItems: 'center', gap: 26,
                padding: '26px 30px', borderRadius: 22,
                background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ flexShrink: 0, width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: hexToRgba(p.accent, 0.16), border: `1px solid ${hexToRgba(p.accent, 0.5)}`,
                  fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: p.accent }}>{i + 1}</div>
                <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 40, color: '#EDF1F8', lineHeight: 1.15 }}>{f}</div>
              </div>
            );
          }}
        </Sprite>
      ))}

      <Sprite start={7.6} end={11.2}>
        {({ localTime }) => {
          const chips = (p.specChips || []).slice(0, 3).map((c) => ({
            v: <><Counter to={+c.value || 0} dur={1.3} /></>,
            u: c.unit,
          }));
          return (
            <div style={{ position: 'absolute', top: 1540, left: 70, width: W - 140, display: 'flex', gap: 20,
              opacity: clamp(localTime / 0.5, 0, 1), transform: `translateY(${(1 - Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1))) * 30}px)` }}>
              {chips.map((c, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '28px 10px', borderRadius: 22,
                  background: 'linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 58, color: '#fff' }}>{c.v}</div>
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
function PriceScene({ p }) {
  return (
    <>
      <Sprite start={11.4} end={16.2}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 360, left: 0, width: W, textAlign: 'center',
              opacity: clamp(localTime / 0.4, 0, 1), transform: `scale(${0.85 + 0.15 * t})` }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '16px 34px', borderRadius: 100,
                background: '#FF3B5C', boxShadow: '0 0 40px rgba(255,59,92,0.6)',
                fontFamily: TEXT, fontWeight: 800, fontSize: 34, letterSpacing: '0.14em', color: '#fff' }}>
                🔥 GIÁ SỐC HÔM NAY
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={11.9} end={16.2}>
        {({ localTime }) => (
          <div style={{ position: 'absolute', top: 540, left: 0, width: W, textAlign: 'center',
            opacity: clamp(localTime / 0.4, 0, 1) }}>
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 52, color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through' }}>{p.priceOriginal}</span>
          </div>
        )}
      </Sprite>

      <Sprite start={12.25} end={16.2}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.55, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 620, left: 0, width: W, textAlign: 'center',
              opacity: clamp(localTime / 0.25, 0, 1), transform: `scale(${0.55 + 0.45 * t})` }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 168, lineHeight: 1, color: '#fff',
                textShadow: `0 0 70px ${hexToRgba(p.accent, 0.85)}` }}>{p.priceSale}</div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={12.7} end={16.2}>
        {({ localTime }) => {
          const t = Easing.easeOutBack(clamp(localTime / 0.5, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 430, left: CX + 250, transform: `scale(${t}) rotate(-10deg)`, transformOrigin: 'center',
              width: 170, height: 170, borderRadius: '50%', background: p.accent, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 50px ${hexToRgba(p.accent, 0.8)}`,
              fontFamily: DISPLAY, color: '#04122E' }}>
              <span style={{ fontWeight: 700, fontSize: 76, lineHeight: 0.9 }}>-{p.discountPercent}</span>
              <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 34 }}>%</span>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={13.3} end={16.2}>
        {({ localTime }) => {
          const flash = 0.6 + 0.4 * Math.abs(Math.sin(localTime * 4));
          return (
            <div style={{ position: 'absolute', top: 900, left: 100, width: W - 200,
              opacity: clamp(localTime / 0.4, 0, 1) }}>
              <div style={{ padding: '34px 30px', borderRadius: 24, textAlign: 'center',
                border: `3px dashed ${hexToRgba(p.accent, flash)}`, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }}>NHẬP MÃ KHI THANH TOÁN</div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: '#fff', letterSpacing: '0.06em', margin: '6px 0' }}>{p.coupon}</div>
                <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 40, color: p.accent }}>{p.couponValue}</div>
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={13.8} end={16.2}>
        <div style={{ position: 'absolute', top: 1320, left: 90, width: W - 180, textAlign: 'center',
          fontFamily: TEXT, fontWeight: 700, fontSize: 44, lineHeight: 1.25, color: '#DBE3F2' }}>
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
      <Sprite start={16.4} end={20}>
        {({ localTime }) => {
          const t = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));
          return (
            <div style={{ position: 'absolute', left: CX - 230, top: 300, width: 460, height: 460, opacity: t, transform: `scale(${0.9 + 0.1 * t})` }}>
              <GlowRing accent={p.accent} size={620} cx={230} cy={230} />
              <ProductImg src={p.productImage} cutout={p.cutout} style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain',
                filter: `drop-shadow(0 30px 60px ${hexToRgba(p.accent, 0.5)})` }} />
            </div>
          );
        }}
      </Sprite>

      <Sprite start={16.7} end={20}>
        <div style={{ position: 'absolute', top: 880, left: 0, width: W, textAlign: 'center',
          fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: '#fff', letterSpacing: '-0.01em' }}>
          {p.shopName}
        </div>
      </Sprite>

      <Sprite start={17.0} end={20}>
        {({ localTime }) => {
          const pulse = 1 + 0.03 * Math.sin(localTime * 4.5);
          const t = Easing.easeOutBack(clamp(localTime / 0.6, 0, 1));
          return (
            <div style={{ position: 'absolute', top: 1080, left: 0, width: W, display: 'flex', justifyContent: 'center',
              opacity: clamp(localTime / 0.3, 0, 1), transform: `scale(${(0.8 + 0.2 * t) * pulse})` }}>
              <div style={{ padding: '40px 90px', borderRadius: 100, background: p.accent, color: '#04122E',
                fontFamily: TEXT, fontWeight: 800, fontSize: 66, letterSpacing: '0.02em',
                boxShadow: `0 0 70px ${hexToRgba(p.accent, 0.85)}` }}>
                MUA NGAY
              </div>
            </div>
          );
        }}
      </Sprite>

      <Sprite start={17.4} end={20}>
        <div style={{ position: 'absolute', top: 1290, left: 60, width: W - 120, textAlign: 'center',
          fontFamily: TEXT, fontWeight: 600, fontSize: 42, color: '#C7D2E6', lineHeight: 1.4 }}>
          {p.ctaLine}
        </div>
      </Sprite>

      <Sprite start={17.7} end={20}>
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
    coupon: props.coupon || 'LUCAS79K',
    couponValue: props.couponValue || 'Giảm thêm 79.000đ',
    cutout: props.cutout === undefined ? true : (props.cutout === 'false' ? false : !!props.cutout),
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
    <Stage width={W} height={H} duration={20} background="#090A0E" persistKey="anker-promo">
      <Sprite start={0} end={20} keepMounted><Bg accent={p.accent} /></Sprite>
      <HookScene p={p} />
      <FeatureScene p={p} features={feats} />
      <PriceScene p={p} />
      <CtaScene p={p} />
      <Sprite start={0} end={20} keepMounted><ProgressBar accent={p.accent} /></Sprite>
    </Stage>
  );
}

window.ProductVideo = ProductVideo;
