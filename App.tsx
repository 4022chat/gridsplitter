import React, { useState, useEffect } from 'react';
import { Icons } from './components/Icon';
import { PromptTabs } from './components/PromptTabs';
import { BrandCard } from './components/BrandCard';
import { ImageCropper } from './components/ImageCropper';
import { SliceEditor } from './components/SliceEditor';
import { GifMaker } from './components/GifMaker';
import { getCroppedImg, generateSlices, downloadImage, padImageToSquare } from './utils/imageProcessing';
import { Brand, CropArea, SliceData } from './types';
import { useApp } from './contexts/AppContext';
import JSZip from 'jszip';

const BRANDS: Brand[] = [
  { name: 'Gemini 3', url: 'https://gemini.google.com/', description: 'Google Gemini 3', color: 'from-blue-500 to-blue-600' },
  { name: 'Midjourney', url: 'https://www.midjourney.com/', description: 'Artistic Creation', color: 'from-indigo-500 to-purple-600' },
  { name: 'Nanoai国内版', url: 'https://www.nanoai.cn?from=invite&invite_id=39762438', description: 'Nanoai国内版', color: 'from-emerald-500 to-teal-600' },
  { name: 'Runninghub', url: 'https://www.runninghub.cn/?inviteCode=iyfx5sdi', description: 'Runninghub 每日免费5次', color: 'from-cyan-500 to-blue-500' },
];

function App() {
  const { theme, toggleTheme, language, toggleLanguage, t } = useApp();
  
  // State
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  
  // Slices state now holds objects
  const [slices, setSlices] = useState<SliceData[]>([]);
  
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(6);
  
  const [isCropping, setIsCropping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isCentering, setIsCentering] = useState(false);

  // Editor State
  const [editingSlice, setEditingSlice] = useState<SliceData | null>(null);

  // GIF Maker State
  const [isGifMakerOpen, setIsGifMakerOpen] = useState(false);

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const result = event.target.result as string;
          setOriginalImage(result);
          setCurrentImage(result); 
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Cross-window Message Handler (for UserScript)
  useEffect(() => {
    // List of trusted domains that can send images to this app
    const ALLOWED_ORIGINS = [
      'https://gemini.google.com',
      'https://chatgpt.com',
      'https://claude.ai',
      'https://www.midjourney.com',
      'https://www.doubao.com',
      'https://www.runninghub.cn',
      'https://jimeng.jianying.com/'
    ];

    const handleMessage = (event: MessageEvent) => {
      // 🛑 Security Check: Only accept messages from trusted origins
      // 屏蔽/删除这段代码可以不检测来源
      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        return;
      }

      if (event.data?.type === 'IMPORT_IMAGE' && event.data?.imageData) {
        // Validate that data is actually an image DataURL
        if (typeof event.data.imageData === 'string' && event.data.imageData.startsWith('data:image/')) {
          setOriginalImage(event.data.imageData);
          setCurrentImage(event.data.imageData);
        }
      } else if (event.data?.type === 'PING') {
        // Reply specifically to the origin that sent the PING
        (event.source as Window)?.postMessage({ type: 'RECEIVER_READY' }, event.origin);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Initial notification for the opener
    if (window.opener) {
      // Note: We use '*' here for the very first handshake because we might not 
      // know the exact origin of the opener before any message is received.
      // However, the actual image data is only processed after the secure handshake.
      window.opener.postMessage({ type: 'RECEIVER_READY' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update slices when image or grid config changes
  useEffect(() => {
    if (currentImage) {
      const run = async () => {
         // Only regenerate if image/grid changed drastically. 
         // Note: If we had edited slices, this rebuilds them and loses edits.
         // In a real app we might try to map old edits, but here we reset on grid change.
         const generated = await generateSlices(currentImage, rows, cols);
         setSlices(generated);
      };
      run();
    } else {
      setSlices([]);
    }
  }, [currentImage, rows, cols]);

  // Crop Handler
  const handleCropComplete = async (cropArea: CropArea) => {
    if (originalImage) {
      setIsProcessing(true);
      try {
        const croppedImgUrl = await getCroppedImg(originalImage, cropArea);
        setCurrentImage(croppedImgUrl);
        setIsCropping(false);
      } catch (e) {
        console.error("Crop failed", e);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Swap Dimensions Handler
  const handleSwapDimensions = () => {
    setRows(cols);
    setCols(rows);
  };



  // Download Handlers
  const handleDownloadAll = async () => {
    if (slices.length === 0) return;
    
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`cut_kkkm_cn_${rows}x${cols}`);
      
      if (folder) {
        slices.forEach((slice, index) => {
          // Use previewUrl which contains the edits or original
          const base64Data = slice.previewUrl.split(',')[1];
          folder.file(`slice_${index + 1}.png`, base64Data, { base64: true });
        });

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `stickers_${new Date().getTime()}_cut_kkkm_cn.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error zipping files:", error);
    } finally {
      setIsZipping(false);
    }
  };

  const updateSlice = (updatedSlice: SliceData) => {
    setSlices(prev => prev.map(s => s.id === updatedSlice.id ? updatedSlice : s));
  };

  const GRID_PRESETS = [
    { r: 3, c: 3, label: '3x3' },
    { r: 4, c: 4, label: '4x4' },
    { r: 4, c: 6, label: '4x6' },
    { r: 3, c: 8, label: '3x8' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 pb-20 font-sans transition-colors duration-300">
      
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none ring-1 ring-black/5">
              <Icons.Grid className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t('app_title')}</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">{t('app_desc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {originalImage && (
               <span className="hidden sm:flex text-xs font-mono px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800 items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 {t('ready')}
               </span>
             )}
             <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
             <button onClick={toggleLanguage} className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <Icons.Languages className="w-5 h-5" />
             </button>
             <button onClick={toggleTheme} className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                {theme === 'light' ? <Icons.Moon className="w-5 h-5" /> : <Icons.Sun className="w-5 h-5" />}
             </button>
             {/* github */}
             <a href="https://github.com/junxiaopang/gridsplitter" target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <Icons.Github className="w-5 h-5" />
             </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Image Area */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Image Uploader / Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[500px] relative flex flex-col group transition-colors">
              {!currentImage ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 m-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer group-hover:shadow-inner">
                   <label className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Icons.Upload className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">{t('upload_title')}</h3>
                    <p className="text-slate-400 dark:text-slate-500 text-center max-w-sm text-sm">{t('upload_desc')}</p>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                   </label>
                </div>
              ) : (
                <div className="relative flex-1 bg-slate-100/50 dark:bg-slate-950/50 flex items-center justify-center p-8 pattern-grid-lg">
                  {/* Grid Overlay Visualization */}
                  <div className="relative shadow-2xl shadow-slate-300/50 dark:shadow-black/50 rounded-md overflow-hidden bg-white dark:bg-black">
                     <img src={currentImage} alt="Preview" className="max-w-full max-h-[600px] object-contain block" />
                     
                     {/* The Grid Lines Overlay */}
                     <div className="absolute inset-0 pointer-events-none z-10">
                        {/* Vertical Lines */}
                        {Array.from({ length: cols - 1 }).map((_, i) => (
                          <div 
                            key={`v-${i}`} 
                            className="absolute top-0 bottom-0 border-r border-indigo-400/80 dark:border-indigo-400/60 shadow-[0_0_2px_rgba(255,255,255,0.8)]" 
                            style={{ left: `${((i + 1) / cols) * 100}%` }}
                          />
                        ))}
                        {/* Horizontal Lines */}
                        {Array.from({ length: rows - 1 }).map((_, i) => (
                          <div 
                            key={`h-${i}`} 
                            className="absolute left-0 right-0 border-b border-indigo-400/80 dark:border-indigo-400/60 shadow-[0_0_2px_rgba(255,255,255,0.8)]" 
                            style={{ top: `${((i + 1) / rows) * 100}%` }}
                          />
                        ))}
                     </div>
                     
                     {/* Overlay Actions */}
                     <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">

                        <button 
                          onClick={() => setIsCropping(true)}
                          className="px-4 py-2 bg-slate-900/80 dark:bg-white/90 backdrop-blur-md text-white dark:text-slate-900 rounded-lg text-sm font-medium hover:bg-black dark:hover:bg-white flex items-center gap-2 shadow-xl border border-white/10 dark:border-black/10"
                        >
                          <Icons.Scissors className="w-3.5 h-3.5" />
                          {t('recrop')}
                        </button>
                        <label className="px-4 py-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-white dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2 shadow-xl border border-white/20 dark:border-slate-700">
                           <Icons.Image className="w-3.5 h-3.5" />
                           {t('change_img')}
                           <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                        </label>
                     </div>
                  </div>
                </div>
              )}
            </div>

            {/* Slices Output Section */}
            {slices.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 animate-in slide-in-from-bottom-4 duration-500 transition-colors">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Icons.Grid className="w-6 h-6 text-indigo-500" />
                      {t('results_title')}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {t('results_desc').replace('{count}', slices.length.toString()).replace('{rows}', rows.toString()).replace('{cols}', cols.toString())}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsGifMakerOpen(true)}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-200 dark:shadow-purple-900/50 hover:shadow-purple-300 dark:hover:shadow-purple-800/50 hover:-translate-y-0.5 flex items-center gap-2"
                    >
                      <Icons.Clapperboard className="w-4 h-4" />
                      {t('gif_button')}
                    </button>
                    <button 
                      onClick={handleDownloadAll}
                      disabled={isZipping}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-wait text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 hover:shadow-indigo-300 dark:hover:shadow-indigo-800/50 hover:-translate-y-0.5 flex items-center gap-2"
                    >
                      {isZipping ? (
                        <>
                          <Icons.Loader2 className="w-4 h-4 animate-spin" />
                          {t('downloading')}
                        </>
                      ) : (
                        <>
                          <Icons.Download className="w-4 h-4" />
                          {t('download_all')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <div 
                  className="grid gap-4" 
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {slices.map((slice, idx) => (
                    <div 
                      key={slice.id} 
                      onClick={() => setEditingSlice(slice)}
                      className="group relative aspect-square bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer"
                    >
                      <img src={slice.previewUrl} alt={`Slice ${idx}`} className="w-full h-full object-contain" />
                      
                      {/* Click overlay hint */}
                      <div className="absolute inset-0 bg-indigo-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <div className="bg-white/90 dark:bg-slate-900/90 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                           <Icons.Wand2 className="w-3 h-3" />
                           Edit
                         </div>
                      </div>
                      <div className="absolute top-1.5 left-2 text-[10px] font-mono text-white/90 drop-shadow-md font-bold bg-red-500 rounded-full px-2 py-0.5text-white hidden md:block">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Banner Ads Section */}
            <div className="hidden md:grid md:grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
              {/* Ad 1: Upscale */}
              <a href="http://nav.kkkm.cn/?category=images" target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 p-6 text-white shadow-lg hover:shadow-blue-500/30 transition-all hover:-translate-y-1 block">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                   <Icons.Zap className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/20">Ad</span>
                     <Icons.Zap className="w-4 h-4 text-yellow-300" />
                   </div>
                   <h3 className="text-xl font-bold mb-1">{t('ad_upscale_title')}</h3>
                   <p className="text-blue-50 text-sm mb-4 leading-relaxed opacity-90">{t('ad_upscale_desc')}</p>
                   <div className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-blue-600 px-3 py-1.5 rounded-full group-hover:bg-blue-50 transition-colors">
                      {t('ad_upscale_btn')}
                      <Icons.ExternalLink className="w-3 h-3" />
                   </div>
                </div>
              </a>

              {/* Ad 2: Animate */}
              <a href="http://nav.kkkm.cn/?category=video" target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 p-6 text-white shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-1 block">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                   <Icons.Clapperboard className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/20">Ad</span>
                     <Icons.Clapperboard className="w-4 h-4 text-pink-200" />
                   </div>
                   <h3 className="text-xl font-bold mb-1">{t('ad_animate_title')}</h3>
                   <p className="text-purple-50 text-sm mb-4 leading-relaxed opacity-90">{t('ad_animate_desc')}</p>
                   <div className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-purple-600 px-3 py-1.5 rounded-full group-hover:bg-purple-50 transition-colors">
                      {t('ad_animate_btn')}
                      <Icons.ExternalLink className="w-3 h-3" />
                   </div>
                </div>
              </a>
            </div>

          </div>

          {/* Right Column: Controls & Prompts */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Controls Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 z-10 transition-colors">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('layout_settings')}</h2>
              </div>
              
              <div className="space-y-6">
                {/* Presets - Updated Design */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-wider">{t('quick_select')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {GRID_PRESETS.map((preset) => (
                       <button 
                       key={preset.label}
                       onClick={() => { setRows(preset.r); setCols(preset.c); }}
                       className={`aspect-[4/3] rounded-lg border flex flex-col items-center justify-center gap-1 transition-all group ${
                         rows === preset.r && cols === preset.c 
                           ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/30' 
                           : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20'
                       }`}
                     >
                       <div className={`grid gap-[1px] w-4 h-4 opacity-80 ${rows === preset.r && cols === preset.c ? 'text-white/90' : 'text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'}`} style={{ gridTemplateColumns: `repeat(${Math.min(preset.c, 3)}, 1fr)`}}>
                          {[...Array(9)].map((_,i) => <span key={i} className="bg-current rounded-[0.5px] aspect-square"></span>)}
                       </div>
                       <span className="text-xs font-bold leading-none">{preset.label}</span>
                     </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-800"></div>

                {/* Custom Inputs */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-wider">{t('custom_rows')}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                      <label className="block text-[10px] text-slate-400 uppercase font-bold px-1">{t('rows_label')}</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="20"
                        value={rows}
                        onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent border-none p-1 text-lg font-mono font-medium text-slate-700 dark:text-slate-200 focus:ring-0 outline-none"
                      />
                    </div>
                    
                    <button 
                      onClick={handleSwapDimensions}
                      className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all flex-shrink-0"
                      title={t('swap_dimensions')}
                    >
                      <Icons.ArrowRightLeft className="w-4 h-4" />
                    </button>

                    <div className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                      <label className="block text-[10px] text-slate-400 uppercase font-bold px-1">{t('cols_label')}</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="20"
                        value={cols}
                        onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent border-none p-1 text-lg font-mono font-medium text-slate-700 dark:text-slate-200 focus:ring-0 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt Generator Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col transition-colors z-100">
               <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-purple-500 rounded-full"></div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('ai_helper')}</h3>
               </div>
               <PromptTabs />
            </div>

            {/* Brand Links */}
             <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors z-100 sticky top-24">
               <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-emerald-500 rounded-full"></div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('rec_tools')}</h3>
               </div>
               <div className="grid grid-cols-2 gap-3">
                 {BRANDS.map((brand) => (
                   <BrandCard key={brand.name} brand={brand} />
                 ))}
               </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-slate-400 dark:text-slate-600 text-sm font-medium">
        <span>© {new Date().getFullYear()} <a 
          href="http://www.kkkm.cn" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          快码·AI实验室
        </a></span>
        
        <span className="mx-2">•</span>
        <a 
          href="http://www.kkkm.cn" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          www.kkkm.cn
        </a>
      </footer>

      {/* Cropper Modal */}
      {isCropping && originalImage && (
        <ImageCropper 
          imageSrc={originalImage}
          rows={rows}
          cols={cols} 
          onCropComplete={handleCropComplete}
          onCancel={() => setIsCropping(false)}
        />
      )}

      {/* Slice Editor Modal */}
      {editingSlice && (
        <SliceEditor 
          slice={editingSlice}
          onSave={updateSlice}
          onClose={() => setEditingSlice(null)}
        />
      )}

      {/* GIF Maker Modal */}
      {isGifMakerOpen && slices.length > 0 && (
        <GifMaker 
          slices={slices}
          onClose={() => setIsGifMakerOpen(false)}
        />
      )}


    </div>
  );
}

export default App;