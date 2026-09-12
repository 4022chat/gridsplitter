import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { loadImage } from './imageProcessing';

export interface GifOptions {
  delay: number;          // 每帧间隔 (ms)
  size: number;           // 输出正方形边长 (px)
  loop: boolean;          // 无限循环
  transparent: boolean;   // 透明背景
}

// 将一组切片图片合成为 GIF，返回 Blob
export const generateGif = async (
  frameUrls: string[],
  options: GifOptions
): Promise<Blob> => {
  const gif = GIFEncoder();
  const { delay, size, loop, transparent } = options;

  for (const url of frameUrls) {
    const img = await loadImage(url);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
    }

    // Contain: 等比缩放居中绘制
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

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
