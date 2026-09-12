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

export interface FrameLayout {
  sx: number; sy: number; sw: number; sh: number; // 源裁剪区域
  dx: number; dy: number; dw: number; dh: number; // 目标绘制区域
}

interface ContentBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- 内容检测 ----

// 切片边缘常残留相邻切片的内容（网格切割产生），检测时忽略外圈边距
const BORDER_MARGIN_RATIO = 0.04;
// 透明像素判定为内容的 alpha 阈值（过滤抗锯齿半透明噪点）
const ALPHA_CONTENT_THRESHOLD = 64;
// 与背景色的差异阈值（R/G/B 绝对差值之和）
const BG_DIFF_THRESHOLD = 100;

// 二值化内容掩码后，取面积最大的连通域的包围盒。
// 相比全局包围盒，可以排除切片边缘残留的相邻贴图碎片和散点噪点。
const largestComponentBox = (
  mask: Uint8Array,
  w: number,
  h: number
): ContentBox | null => {
  const labels = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];

  let bestArea = 0;
  let bestBox: ContentBox | null = null;
  let label = 0;

  for (let start = 0; start < w * h; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;

    // BFS 泛洪填充
    label++;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;

    let area = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1;

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 4 邻域
      if (x > 0) {
        const q = p - 1;
        if (mask[q] === 1 && labels[q] === -1) { labels[q] = label; stack.push(q); }
      }
      if (x < w - 1) {
        const q = p + 1;
        if (mask[q] === 1 && labels[q] === -1) { labels[q] = label; stack.push(q); }
      }
      if (y > 0) {
        const q = p - w;
        if (mask[q] === 1 && labels[q] === -1) { labels[q] = label; stack.push(q); }
      }
      if (y < h - 1) {
        const q = p + w;
        if (mask[q] === 1 && labels[q] === -1) { labels[q] = label; stack.push(q); }
      }
    }

    if (area > bestArea) {
      bestArea = area;
      bestBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
  }

  return bestBox;
};

// 检测一帧中"实际内容"的包围盒：
// - 有透明像素 → 按不透明区域计算
// - 完全不透明 → 估计边缘背景色，按与背景色的差异计算
// 返回 null 表示检测不到有效内容（退回整帧）
const detectContentBox = (
  data: Uint8ClampedArray,
  w: number,
  h: number
): ContentBox | null => {
  // 忽略外圈边距（消除网格切割的相邻内容残留）
  const mx = Math.max(1, Math.round(w * BORDER_MARGIN_RATIO));
  const my = Math.max(1, Math.round(h * BORDER_MARGIN_RATIO));

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { hasAlpha = true; break; }
  }

  const mask = new Uint8Array(w * h);

  if (hasAlpha) {
    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        const i = (y * w + x) * 4;
        mask[y * w + x] = data[i + 3] > ALPHA_CONTENT_THRESHOLD ? 1 : 0;
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

    for (let y = my; y < h - my; y++) {
      for (let x = mx; x < w - mx; x++) {
        const i = (y * w + x) * 4;
        const diff =
          Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
        mask[y * w + x] = diff > BG_DIFF_THRESHOLD ? 1 : 0;
      }
    }
  }

  const box = largestComponentBox(mask, w, h);
  if (!box || box.w < 2 || box.h < 2) return null;
  return box;
};

// ---- 布局计算（对齐核心，供 GIF 编码与实时预览共用） ----

export interface FrameLayoutResult {
  images: HTMLImageElement[];
  layouts: FrameLayout[];
}

const PAD_RATIO = 0.05;

export const computeFrameLayouts = async (
  frameUrls: string[],
  align: GifAlignMode,
  size: number
): Promise<FrameLayoutResult> => {
  const images = await Promise.all(frameUrls.map(loadImage));

  // Pass 1: 内容检测（仅在对齐模式开启时）
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

  const pad = Math.round(size * PAD_RATIO);

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
    commonScale = Math.min((size - pad * 2) / maxW, (size - pad * 2) / maxH);
  }

  const layouts: FrameLayout[] = images.map((img, i) => {
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
      scale = Math.min((size - pad * 2) / sw, (size - pad * 2) / sh);
    } else {
      scale = Math.min(size / img.width, size / img.height);
    }

    const dw = sw * scale;
    const dh = sh * scale;
    return { sx, sy, sw, sh, dx: (size - dw) / 2, dy: (size - dh) / 2, dw, dh };
  });

  return { images, layouts };
};

// 将一帧按布局绘制到 canvas（供预览与编码共用）
export const drawFrame = (
  img: HTMLImageElement,
  layout: FrameLayout,
  size: number,
  fillBackground: string | null
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (fillBackground) {
    ctx.fillStyle = fillBackground;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.drawImage(
    img,
    layout.sx, layout.sy, layout.sw, layout.sh,
    layout.dx, layout.dy, layout.dw, layout.dh
  );
  return canvas;
};

// ---- 透明 GIF 专用编码 ----

// alpha 二值化阈值：低于此值直接透明，高于等于则完全不透明
const ALPHA_BINARIZE_THRESHOLD = 128;

// 先将 alpha 二值化（GIF 只支持 1bit 透明度），再用 rgb565 做高质量颜色量化，
// 最后预留一个专用透明索引，避免半透明边缘像素被量化成深色 → 黑边。
const writeTransparentFrame = (
  gif: ReturnType<typeof GIFEncoder>,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  delay: number,
  repeat: number,
  first: boolean
) => {
  // 1. 二值化 alpha：丢弃的像素 RGB 清零（会进入专用透明索引）
  const binary = new Uint8ClampedArray(data);
  let hasTransparent = false;
  let opaqueCount = 0;
  for (let i = 0; i < binary.length; i += 4) {
    if (binary[i + 3] < ALPHA_BINARIZE_THRESHOLD) {
      binary[i] = 0; binary[i + 1] = 0; binary[i + 2] = 0; binary[i + 3] = 0;
      hasTransparent = true;
    } else {
      binary[i + 3] = 255;
      opaqueCount++;
    }
  }

  let palette: number[][];
  let transparentIndex: number;

  if (!hasTransparent || opaqueCount === 0) {
    if (opaqueCount === 0) {
      // 整帧透明
      palette = [[0, 0, 0, 0]];
      gif.writeFrame(new Uint8Array(width * height), width, height, {
        palette, delay, repeat,
        transparent: true, transparentIndex: 0, dispose: 2,
      });
      return;
    }
    if (!hasTransparent) {
      // 无透明像素 → 按不透明帧处理
      const pal = quantize(binary, 256, { format: 'rgb565' });
      const index = applyPalette(binary, pal, 'rgb565');
      gif.writeFrame(index, width, height, { palette: pal, delay, repeat });
      return;
    }
  }

  // 2. 只用不透明像素做颜色量化（rgb565，8bit 级色彩质量，避免 rgba4444 的色彩断层）
  const opaqueData = new Uint8ClampedArray(opaqueCount * 4);
  for (let i = 0, j = 0; i < binary.length; i += 4) {
    if (binary[i + 3] === 255) {
      opaqueData[j++] = binary[i];
      opaqueData[j++] = binary[i + 1];
      opaqueData[j++] = binary[i + 2];
      opaqueData[j++] = 255;
    }
  }
  palette = quantize(opaqueData, 255, { format: 'rgb565' });
  // 3. 预留专用透明索引（挂在实际不存在的颜色上，不会与真实颜色冲突）
  palette.push([0, 0, 0, 0]);
  transparentIndex = palette.length - 1;

  // 4. 按调色板映射像素，透明像素直接指向透明索引
  const index = applyPalette(binary, palette, 'rgb565');
  for (let i = 0, p = 0; i < binary.length; i += 4, p++) {
    if (binary[i + 3] === 0) index[p] = transparentIndex;
  }

  gif.writeFrame(index, width, height, {
    palette, delay, repeat,
    transparent: true, transparentIndex, dispose: 2,
  });
};

// 将一组切片图片合成为 GIF，返回 Blob
export const generateGif = async (
  frameUrls: string[],
  options: GifOptions
): Promise<Blob> => {
  const { delay, size, loop, transparent, align } = options;
  const { images, layouts } = await computeFrameLayouts(frameUrls, align, size);
  const repeat = loop ? 0 : -1;

  const gif = GIFEncoder();

  images.forEach((img, i) => {
    const canvas = drawFrame(img, layouts[i], size, transparent ? null : '#ffffff');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { data, width, height } = ctx.getImageData(0, 0, size, size);

    if (transparent) {
      writeTransparentFrame(gif, data, width, height, delay, repeat, i === 0);
    } else {
      const palette = quantize(data, 256, { format: 'rgb565' });
      const index = applyPalette(data, palette, 'rgb565');
      gif.writeFrame(index, width, height, { palette, delay, repeat });
    }
  });

  gif.finish();
  const bytes = gif.bytesView();
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
};
