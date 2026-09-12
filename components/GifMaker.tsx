import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icon';
import { useApp } from '../contexts/AppContext';
import { SliceData } from '../types';
import { generateGif, GifAlignMode } from '../utils/gifGenerator';

interface GifMakerProps {
  slices: SliceData[];
  onClose: () => void;
}

const SIZE_OPTIONS = [128, 256, 512];
const DELAY_PRESETS = [100, 200, 300, 500];

export const GifMaker: React.FC<GifMakerProps> = ({ slices, onClose }) => {
  const { t } = useApp();

  const [selected, setSelected] = useState<boolean[]>(() => slices.map(() => true));
  const [delay, setDelay] = useState(200);
  const [size, setSize] = useState(256);
  const [transparent, setTransparent] = useState(true);
  const [loop, setLoop] = useState(true);
  const [align, setAlign] = useState<GifAlignMode>('uniform');

  const [isGenerating, setIsGenerating] = useState(false);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 实时预览：按 delay 轮播选中帧
  const [previewIdx, setPreviewIdx] = useState(0);
  const frames = useMemo(
    () => slices.filter((_, i) => selected[i]).map(s => s.previewUrl),
    [slices, selected]
  );

  useEffect(() => {
    if (gifUrl || frames.length === 0) return;
    setPreviewIdx(0);
    const timer = setInterval(() => {
      setPreviewIdx(prev => (prev + 1) % frames.length);
    }, Math.max(delay, 50));
    return () => clearInterval(timer);
  }, [frames, delay, gifUrl]);

  // 释放生成的 GIF objectURL
  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl]);

  // 设置变化后失效已生成的 GIF
  useEffect(() => {
    if (gifUrl) {
      URL.revokeObjectURL(gifUrl);
      setGifUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, size, transparent, loop, align]);

  const toggleFrame = (idx: number) => {
    setSelected(prev => prev.map((s, i) => (i === idx ? !s : s)));
  };

  const toggleAll = () => {
    const allSelected = selected.every(Boolean);
    setSelected(selected.map(() => !allSelected));
  };

  const handleGenerate = async () => {
    if (frames.length === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const blob = await generateGif(frames, { delay, size, loop, transparent, align });
      const url = URL.createObjectURL(blob);
      setGifUrl(url);
    } catch (e) {
      console.error('GIF generation failed', e);
      setError(t('gif_error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!gifUrl) return;
    const link = document.createElement('a');
    link.href = gifUrl;
    link.download = `gridsplitter_${Date.now()}.gif`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedCount = frames.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">

        {/* Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icons.Clapperboard className="w-5 h-5 text-purple-500" />
            {t('gif_title')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
          {/* Preview Area */}
          <div className="flex-1 bg-slate-100 dark:bg-slate-950/50 flex items-center justify-center p-8 relative min-h-[300px]">
            <div
              className="rounded-lg overflow-hidden shadow-2xl shadow-black/20 border border-slate-200 dark:border-slate-700"
              style={{
                width: size > 256 ? 320 : 256,
                height: size > 256 ? 320 : 256,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 10px 10px',
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%, #e5e7eb), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%, #e5e7eb)',
                backgroundColor: '#fff',
              }}
            >
              {frames.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm px-4 text-center">
                  {t('gif_empty')}
                </div>
              ) : gifUrl ? (
                <img src={gifUrl} alt="GIF Preview" className="w-full h-full object-contain" />
              ) : (
                <img
                  src={frames[Math.min(previewIdx, frames.length - 1)]}
                  alt={`Frame ${previewIdx + 1}`}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400 dark:text-slate-500">
              {gifUrl ? t('gif_preview_generated') : t('gif_preview_live')}
            </div>
          </div>

          {/* Settings Sidebar */}
          <div className="md:w-72 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5 space-y-5 overflow-y-auto shrink-0">
            {/* Frame delay */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">
                {t('gif_delay')}
              </label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {DELAY_PRESETS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDelay(d)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      delay === d
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-purple-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={delay}
                onChange={e => setDelay(parseInt(e.target.value))}
                className="w-full accent-purple-600"
              />
              <div className="text-center text-[10px] font-mono text-slate-400">{delay} ms</div>
            </div>

            {/* Auto align */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">
                {t('gif_align')}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { mode: 'off' as GifAlignMode, label: t('gif_align_off') },
                  { mode: 'center' as GifAlignMode, label: t('gif_align_center') },
                  { mode: 'uniform' as GifAlignMode, label: t('gif_align_uniform') },
                ]).map(opt => (
                  <button
                    key={opt.mode}
                    onClick={() => setAlign(opt.mode)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      align === opt.mode
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-purple-400'
                    }`}
                    title={
                      opt.mode === 'off'
                        ? t('gif_align_off_hint')
                        : opt.mode === 'center'
                        ? t('gif_align_center_hint')
                        : t('gif_align_uniform_hint')
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                {t('gif_align_hint')}
              </p>
            </div>

            {/* Output size */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">
                {t('gif_size')}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {SIZE_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      size === s
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-purple-400'
                    }`}
                  >
                    {s}px
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <ToggleRow label={t('gif_transparent')} checked={transparent} onChange={setTransparent} />
              <ToggleRow label={t('gif_loop')} checked={loop} onChange={setLoop} />
            </div>

            {/* Frame selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {t('gif_frames')}
                </label>
                <button
                  onClick={toggleAll}
                  className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline"
                >
                  {selected.every(Boolean) ? t('gif_deselect_all') : t('gif_select_all')}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mb-2">
                {t('gif_selected_count').replace('{n}', selectedCount.toString()).replace('{total}', slices.length.toString())}
              </p>
              <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {slices.map((slice, idx) => (
                  <button
                    key={slice.id}
                    onClick={() => toggleFrame(idx)}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                      selected[idx]
                        ? 'border-purple-500 ring-1 ring-purple-300 dark:ring-purple-800'
                        : 'border-slate-200 dark:border-slate-700 opacity-40 hover:opacity-70'
                    }`}
                    title={t('gif_frame_toggle')}
                  >
                    <img src={slice.previewUrl} alt={`Frame ${idx + 1}`} className="w-full h-full object-contain bg-slate-100 dark:bg-slate-800" />
                    <span className="absolute bottom-0 left-0 text-[8px] font-mono font-bold bg-black/60 text-white px-1 rounded-tr">
                      {idx + 1}
                    </span>
                    {selected[idx] && (
                      <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                        <Icons.Check className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-16 px-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : gifUrl ? (
              t('gif_generated')
            ) : (
              `${selectedCount} ${t('gif_frames_unit')}`
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || selectedCount === 0}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg text-sm font-bold shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Icons.Loader2 className="w-4 h-4 animate-spin" />
                  {t('gif_generating')}
                </>
              ) : (
                <>
                  <Icons.Wand2 className="w-4 h-4" />
                  {gifUrl ? t('gif_regenerate') : t('gif_generate')}
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={!gifUrl}
              className="px-5 py-2 bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-white dark:text-slate-900 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Icons.Download className="w-4 h-4" />
              {t('gif_download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToggleRow = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:border-purple-400 transition-colors"
  >
    {label}
    <span
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </span>
  </button>
);
