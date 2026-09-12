import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
type Language = 'zh' | 'en';

interface AppContextType {
  theme: Theme;
  toggleTheme: () => void;
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations = {
  zh: {
    app_title: "切图神器",
    app_desc: "AI 驱动的表情包制作工具",
    ready: "就绪",
    upload_title: "点击或拖拽上传图片",
    upload_desc: "支持 JPG, PNG, WebP 格式。建议上传 16:9 或 1:1 的高分辨率原图。",
    recrop: "重新裁剪",
    change_img: "更换图片",
    remove_bg: "智能抠图",
    removing_bg: "抠图中...",
    results_title: "切割结果",
    results_desc: "共 {count} 张切片 ({rows} 行 x {cols} 列)",
    download_all: "导出",
    downloading: "打包中...",
    layout_settings: "布局设置",
    quick_select: "快速选择",
    custom_rows: "自定义行列",
    rows_label: "行数 Rows",
    cols_label: "列数 Cols",
    swap_dimensions: "交换行列",
    ai_helper: "AI 提示词助手",
    rec_tools: "推荐生图工具",
    preset_line: "Line 风格",
    preset_3d: "3D 盲盒",
    btn_more: "更多提示词",
    input_placeholder: "输入主题，如：像素风小狗...",
    btn_generate: "生成",
    copy_success: "已复制",
    crop_title: "裁剪图片",
    crop_cancel: "取消",
    crop_confirm: "确认裁剪",
    crop_hint: "拖动方框调整位置，拖拽边缘和角落调整大小",
    prompt_p1_content: "为我生成图中角色的绘制 Q 版的，LINE 风格的半身像表情包，注意头饰要正确\n彩色手绘风格，使用 4x6 布局，涵盖各种各样的常用聊天语句，或是一些有关的娱乐 meme\n其他需求：不要原图复制。所有标注为手写简体中文。\n生成的图片需为 4K 分辨率 16:9，图片纯净，不要有其他额外元素",
    prompt_p2_content: "设计一套 3D 盲盒玩偶风格的表情包，C4D 渲染，OC 渲染器，粘土材质，柔和的演播室灯光。\n角色表情夸张可爱，包含：大笑、流泪、惊讶、疑问、生气、比心。\n背景为纯色柔和渐变。九宫格布局 (3x3)。\n生成图片需为 4K 分辨率，极高细节。图片纯净，不要有其他额外元素",
    ai_placeholder: "AI 生成的提示词将显示在这里...",
    ai_fail: "AI 服务暂时不可用或 API Key 无效。",
    ai_key_hint: "请配置 API Key 以使用 AI 生成功能。",
    ad_upscale_title: "图片模糊看不清？",
    ad_upscale_desc: "AI 智能无损放大，一键修复噪点，秒变 4K 高清大图！",
    ad_upscale_btn: "立即体验高清修复",
    ad_animate_title: "表情包太死板？",
    ad_animate_desc: "赋予角色灵魂！一键让静态图动起来，生成魔性 GIF 表情。",
    ad_animate_btn: "制作动态表情",
    editor_title: "图片编辑器",
    editor_save: "保存更改",
    editor_reset: "重置画布",
    tool_move: "移动/缩放",
    tool_brush: "画笔/橡皮",
    tool_text: "添加文字",
    tool_add_text: "点击编辑文字",
    gif_button: "合成 GIF",
    gif_title: "合成 GIF 动图",
    gif_delay: "帧间隔",
    gif_size: "输出尺寸",
    gif_transparent: "透明背景",
    gif_loop: "无限循环",
    gif_frames: "帧选择",
    gif_select_all: "全选",
    gif_deselect_all: "全不选",
    gif_selected_count: "已选 {n} / {total} 帧",
    gif_frame_toggle: "点击切换是否包含此帧",
    gif_generate: "生成 GIF",
    gif_regenerate: "重新生成",
    gif_generating: "生成中...",
    gif_generated: "GIF 已生成，可预览并下载",
    gif_download: "下载 GIF",
    gif_preview_live: "实时预览（生成前）",
    gif_preview_generated: "GIF 实际效果预览",
    gif_empty: "请至少选择一帧",
    gif_frames_unit: "帧",
    gif_error: "GIF 生成失败，请重试",
    gif_align: "自动对齐",
    gif_align_off: "关闭",
    gif_align_off_hint: "不做对齐，整帧缩放居中",
    gif_align_center: "居中",
    gif_align_center_hint: "裁出每帧内容并居中，保留各帧相对大小",
    gif_align_uniform: "居中+统一",
    gif_align_uniform_hint: "裁出每帧内容，统一缩放到相同大小并居中（推荐）",
    gif_align_hint: "自动检测每帧内容区域，修正切片的位置与大小偏差；对齐效果在生成后的预览中体现",
  },
  en: {
    app_title: "GridSplitter Pro",
    app_desc: "AI Powered Sticker Tool",
    ready: "Ready",
    upload_title: "Click or Drag to Upload",
    upload_desc: "Supports JPG, PNG, WebP. High-res 16:9 or 1:1 images recommended.",
    recrop: "Re-Crop",
    change_img: "Change Image",
    remove_bg: "Remove BG",
    removing_bg: "Processing...",
    results_title: "Slicing Results",
    results_desc: "{count} slices total ({rows} rows x {cols} cols)",
    download_all: "Export",
    downloading: "Zipping...",
    layout_settings: "Layout Settings",
    quick_select: "Quick Select",
    custom_rows: "Custom Grid",
    rows_label: "Rows",
    cols_label: "Cols",
    swap_dimensions: "Swap Dimensions",
    ai_helper: "AI Prompt Assistant",
    rec_tools: "Recommended AI Tools",
    preset_line: "Line Style",
    preset_3d: "3D Blind Box",
    btn_more: "More Prompts",
    input_placeholder: "Enter topic, e.g., Pixel art dog...",
    btn_generate: "Generate",
    copy_success: "Copied",
    crop_title: "Crop Image",
    crop_cancel: "Cancel",
    crop_confirm: "Confirm Crop",
    crop_hint: "Drag box to move, drag edges and corners to resize",
    prompt_p1_content: "Generate a set of Q-version, LINE-style half-body sticker pack for the character in the image. Pay attention to head accessories.\nColorful hand-drawn style, use 4x6 layout, covering various common chat phrases or entertainment memes.\nRequirements: Do not copy the original image exactly. All text labels should be handwritten English.\nGenerated image must be 4K resolution, 16:9 aspect ratio.",
    prompt_p2_content: "Design a set of 3D blind box style stickers, C4D render, Octane render, clay material, soft studio lighting.\nCharacters have exaggerated cute expressions including: laughing, crying, surprised, questioning, angry, finger heart.\nBackground: solid color soft gradient. 3x3 grid layout.\nGenerated image must be 4K resolution, high detail.",
    ai_placeholder: "AI generated prompt will appear here...",
    ai_fail: "AI service unavailable or invalid API Key.",
    ai_key_hint: "Please configure API Key to use AI generation.",
    ad_upscale_title: "Image too blurry?",
    ad_upscale_desc: "AI Upscale to 4K instantly! Fix noise and enhance details in one click.",
    ad_upscale_btn: "Try HD Upscale",
    ad_animate_title: "Stickers too static?",
    ad_animate_desc: "Bring characters to life! Animate static images into viral GIFs effortlessly.",
    ad_animate_btn: "Create Animated Stickers",
    editor_title: "Slice Editor",
    editor_save: "Save Changes",
    editor_reset: "Reset Canvas",
    tool_move: "Move/Scale",
    apikey_save: "Save Key",
    apikey_missing: "Missing API Key",
    apikey_link: "Get Key",
    error_apikey: "Please configure Remove.bg API Key first",
    gif_button: "Make GIF",
    gif_title: "Create GIF",
    gif_delay: "Frame Delay",
    gif_size: "Output Size",
    gif_transparent: "Transparent BG",
    gif_loop: "Loop Forever",
    gif_frames: "Frames",
    gif_select_all: "Select All",
    gif_deselect_all: "Deselect All",
    gif_selected_count: "{n} / {total} selected",
    gif_frame_toggle: "Click to toggle this frame",
    gif_generate: "Generate GIF",
    gif_regenerate: "Regenerate",
    gif_generating: "Generating...",
    gif_generated: "GIF ready — preview and download",
    gif_download: "Download GIF",
    gif_preview_live: "Live preview (before generating)",
    gif_preview_generated: "Actual GIF preview",
    gif_empty: "Please select at least one frame",
    gif_frames_unit: "frames",
    gif_error: "GIF generation failed, please retry",
    gif_align: "Auto Align",
    gif_align_off: "Off",
    gif_align_off_hint: "No alignment; scale and center the whole frame",
    gif_align_center: "Center",
    gif_align_center_hint: "Crop each frame's content and center it, keeping relative sizes",
    gif_align_uniform: "Center+Fit",
    gif_align_uniform_hint: "Crop content and normalize to the same size, centered (recommended)",
    gif_align_hint: "Detects each frame's content area to fix offset & size drift; alignment is applied to the generated GIF preview"
  }
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [language, setLanguage] = useState<Language>('zh');

  // Initialize theme from system preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }

  }, []);

  // Update HTML class for Tailwind dark mode
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'zh' ? 'en' : 'zh');
  };



  const t = (key: string): string => {
    return (translations[language] as any)[key] || key;
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, language, toggleLanguage, t }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};