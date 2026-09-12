import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { loadImage } from './imageProcessing';

export type GifAlignMode = 'off' | 'center' | 'uniform';

export interface GifOptions {
  delay: number;          // 每帧间隔 (ms)
  size: number;           // 输出正方形边长 (px)
  loop: boolean;          // 无限循环
  transparent: boolean;   // 透明背景
  align: GifAlignMode;    // 帧对齐模式
}

interface ContentBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 与背景色的差异阈值（R/G/B 绝对差值之和）
const BG_DIFF_THRESHOLD = 100;

// 检测一帧中"实际内容"的包围盒：
// - 有透明像素 → 按不透明区域计算
// - 完全不透明 → 估计边缘背景色，按与背景色的差异计算
// 内容几乎铺满整帧时返回 null（视为无法对齐，退回原图）
const detectContentBox = (
  data: Uint8ClampedArray,
  w: number,
  h: number
): ContentBox | null => {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const mark = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  // 是否存在透明像素
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { hasAlpha = true; break; }
  }

  if (hasAlpha) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) mark(x, y);
      }
    }
  } else {
    // 估计背景色：取四周 2px 边框像素的平均值
    let r = 0, g = 0, b = 0, n = 0;
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < 2; y++) { sample(x, y); sample(x, h - 1 - y); }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 2; x++) { sample(x, y); sample(w - 1 - x, y); }
    }
    r /= n; g /= n; b /= n;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const diff =
          Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
        if (diff > BG_DIFF_THRESHOLD) mark(x, y);
      }
    }
  }

  if (maxX < 0) return null;

  const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  if (box.w < 2 || box.h < 2) return null;
  // 内容基本铺满整帧（背景复杂或检测失败）→ 不裁剪
  if (box.w * box.h > w * h * 0.96) return null;
  return box;
};

// 将一组切片图片合成为 GIF，返回 Blob
export const generateGif = async (
  frameUrls: string[],
  options: GifOptions
): Promise<Blob> => {
  const { delay, size, loop, transparent, align } = options;
  const images = await Promise.all(frameUrls.map(loadImage));

  // Pass 1: 对每帧做内容检测（仅在对齐模式开启时）
  const boxes: (ContentBox | null)[] = [];
  if (align !== 'off') {
    for (const img of images) {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (!cctx) { boxes.push(null); continue; }
      cctx.drawImage(img, 0, 0);
      const { data } = cctx.getImageData(0, 0, img.width, img.height);
      boxes.push(detectContentBox(data, img.width, img.height));
    }
  }

  const PAD = Math.round(size * 0.05);

  // center 模式：所有帧共用一个缩放系数（保留各帧内容相对大小）
  let commonScale = 1;
  if (align === 'center') {
    let maxW = 0, maxH = 0;
    images.forEach((img, i) => {
      const bw = boxes[i] ? boxes[i]!.w : img.width;
      const bh = boxes[i] ? boxes[i]!.h : img.height;
      if (bw > maxW) maxW = bw;
      if (bh > maxH) maxH = bh;
    });
    commonScale = Math.min((size - PAD * 2) / maxW, (size - PAD * 2) / maxH);
  }

  const gif = GIFEncoder();

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const box = align !== 'off' ? boxes[i] : null;
    const sx = box ? box.x : 0;
    const sy = box ? box.y : 0;
    const sw = box ? box.w : img.width;
    const sh = box ? box.h : img.height;

    let scale: number;
    if (align === 'center') {
      scale = commonScale;
    } else if (align === 'uniform') {
      // uniform 模式：每帧内容都等比缩放到同一尺寸（修正大小不一）
      scale = Math.min((size - PAD * 2) / sw, (size - PAD * 2) / sh);
    } else {
      scale = Math.min(size / img.width, size / img.height);
    }

    const dw = sw * scale;
    const dh = sh * scale;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
    }

    ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);

    const { data, width, height } = ctx.getImageData(0, 0, size, size);

    if (transparent) {
      const palette = quantize(data, 256, { format: 'rgba4444' });
      const index = applyPalette(data, palette, 'rgba4444');
      const transparentIndex = palette.findIndex(p => p.length === 4 && p[3] === 0);
      gif.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: loop ? 0 : -1,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(transparentIndex, 0),
        dispose: 2,
      });
    } else {
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: loop ? 0 : -1,
      });
    }
  }

  gif.finish();
  const bytes = gif.bytesView();
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
};
