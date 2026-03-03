import { useState, useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { RefreshCw, Upload, Save, Settings, Type } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { getSupabaseClient, SUPABASE_BADGE_SAVED_VIEW, SUPABASE_BADGE_TABLE } from '../lib/supabase';

// Default configuration for the frame layout
// These are initial guesses. The user can adjust them in "Setup Mode".
const DEFAULT_CONFIG = {
  canvasWidth: 800,
  canvasHeight: 800,
  maskX: 400,
  maskY: 350,
  maskRadius: 200,
  text1X: 400,
  text1Y: 600,
  text2X: 400,
  text2Y: 700,
  text1Content: "DOANH SỐ",
  text1Color: "#FFFFFF",
  text2Color: "#FFFFFF",
  textFontSize: 40,
};

const FIXED_FRAME_URL = new URL('../../frame.png', import.meta.url).href;

type SavedBadge = {
  id: number;
  image_data: string;
  text2_value: string | null;
  created_at: string;
};

type ActiveTab = 'editor' | 'saved';

export default function BadgeMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [userImage, setUserImage] = useState<fabric.Image | null>(null);
  const [frameImage, setFrameImage] = useState<fabric.Image | null>(null);
  const [text2Object, setText2Object] = useState<fabric.IText | null>(null);
  
  const [text2Value, setText2Value] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedBadges, setSavedBadges] = useState<SavedBadge[]>([]);
  const [isLoadingSavedBadges, setIsLoadingSavedBadges] = useState(false);
  const [savedBadgesError, setSavedBadgesError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<SavedBadge | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  
  const formatSupabaseError = (error: unknown): string => {
    if (error instanceof Error) {
      if (error.message.includes('Could not find the table')) {
        return `Chưa tìm thấy bảng "${SUPABASE_BADGE_TABLE}" trong schema public. Hãy chạy file supabase_badge_images.sql trên Supabase SQL Editor hoặc đổi VITE_SUPABASE_TABLE đúng tên bảng hiện có.`;
      }
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const maybeError = error as Record<string, unknown>;
      const message = maybeError.message;
      const details = maybeError.details;
      const hint = maybeError.hint;

      const parts = [message, details, hint]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

      if (parts.length > 0) {
        return parts.join(' | ');
      }
    }

    return 'Không nhận được chi tiết lỗi từ Supabase.';
  };

  const loadSavedBadges = useCallback(async () => {
    setIsLoadingSavedBadges(true);
    setSavedBadgesError(null);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(SUPABASE_BADGE_SAVED_VIEW)
        .select('id, image_data, text2_value, created_at')
        .limit(12);

      if (error) {
        throw error;
      }

      setSavedBadges((data ?? []) as SavedBadge[]);
    } catch (error) {
      setSavedBadgesError(formatSupabaseError(error));
    } finally {
      setIsLoadingSavedBadges(false);
    }
  }, []);

  // Configuration state
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: config.canvasWidth,
      height: config.canvasHeight,
      backgroundColor: '#f0f0f0',
      preserveObjectStacking: true, // Important for layering
    });

    setFabricCanvas(canvas);

    // Initial setup
    setupDefaultObjects(canvas);

    return () => {
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'saved') {
      loadSavedBadges();
    }
  }, [activeTab, loadSavedBadges]);

  // Handle Text 2 updates
  useEffect(() => {
    if (text2Object && fabricCanvas) {
      text2Object.set({ text: text2Value || "CỤM THỨ 2" });
      // Re-apply position from config.
      // We want it at config.text2X.
      text2Object.set({ left: config.text2X });
      fabricCanvas.requestRenderAll();
    }
  }, [text2Value, text2Object, fabricCanvas, config.text2X]);

  // Handle Config Updates (Real-time adjustment of mask/text positions)
  useEffect(() => {
    if (!fabricCanvas) return;

    // Update Mask (ClipPath)
    if (userImage) {
      const mask = new fabric.Circle({
        radius: config.maskRadius,
        left: config.maskX,
        top: config.maskY,
        originX: 'center',
        originY: 'center',
        absolutePositioned: true,
      });
      userImage.set({ clipPath: mask });
    }

    // Update Text Positions
    const objects = fabricCanvas.getObjects();
    const text1 = objects.find(o => (o as any).id === 'text1') as fabric.IText;
    const text2 = objects.find(o => (o as any).id === 'text2') as fabric.IText;

    if (text1) {
      text1.set({ 
        left: config.text1X, 
        top: config.text1Y,
        fill: config.text1Color,
        fontSize: config.textFontSize
      });
    }
    if (text2) {
      text2.set({ 
        left: config.text2X, 
        top: config.text2Y,
        fill: config.text2Color,
        fontSize: config.textFontSize
      });
      setText2Object(text2);
    }

    fabricCanvas.requestRenderAll();
  }, [config, fabricCanvas, userImage]);

  const setupDefaultObjects = async (canvas: fabric.Canvas) => {
    // 1. Add Text 1 (Fixed)
    const text1 = new fabric.IText(config.text1Content, {
      left: config.text1X,
      top: config.text1Y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fontSize: config.textFontSize,
      fontWeight: 'bold',
      fill: config.text1Color,
      selectable: false,
      evented: false,
      id: 'text1', // Custom ID for retrieval
    } as any);
    canvas.add(text1);

    // 2. Add Text 2 (Dynamic)
    const text2 = new fabric.IText("CỤM THỨ 2", {
      left: config.text2X,
      top: config.text2Y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fontSize: config.textFontSize,
      fontWeight: 'bold',
      fill: config.text2Color,
      selectable: false,
      evented: false,
      id: 'text2',
    } as any);
    canvas.add(text2);
    setText2Object(text2);

    // 3. Load fixed frame image from project asset
    try {
      const frame = await fabric.Image.fromURL(FIXED_FRAME_URL);
      frame.set({
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
        scaleX: config.canvasWidth / (frame.width || 1),
        scaleY: config.canvasHeight / (frame.height || 1),
      });
      canvas.add(frame);
      setFrameImage(frame);
      canvas.moveObjectTo(frame, 0);
      canvas.bringObjectToFront(text1);
      canvas.bringObjectToFront(text2);
      canvas.requestRenderAll();
    } catch (error) {
      console.error('Failed to load fixed frame image:', error);
    }
  };

  // --- File Handling ---

  const handleUserImageUpload = (files: File[]) => {
    if (!fabricCanvas || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      const img = await fabric.Image.fromURL(result);

      // Remove old user image
      if (userImage) {
        fabricCanvas.remove(userImage);
      }

      // Initial scaling to fit reasonably
      const scale = Math.min(
        config.canvasWidth / (img.width || 1),
        config.canvasHeight / (img.height || 1)
      );

      img.set({
        left: config.canvasWidth / 2,
        top: config.canvasHeight / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
        // The user image IS selectable and movable
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
      });

      // Apply Mask
      const mask = new fabric.Circle({
        radius: config.maskRadius,
        left: config.maskX,
        top: config.maskY,
        originX: 'center',
        originY: 'center',
        absolutePositioned: true,
      });
      img.clipPath = mask;

      fabricCanvas.add(img);
      setUserImage(img);

      // Keep layer order stable: User Image < Frame < Text
      fabricCanvas.moveObjectTo(img, 0);
      if (frameImage) {
        fabricCanvas.moveObjectTo(frameImage, 1);
      }
      const text1 = fabricCanvas.getObjects().find(o => (o as any).id === 'text1');
      const text2 = fabricCanvas.getObjects().find(o => (o as any).id === 'text2');
      if (text1) fabricCanvas.bringObjectToFront(text1);
      if (text2) fabricCanvas.bringObjectToFront(text2);
      
      fabricCanvas.setActiveObject(img);
      fabricCanvas.requestRenderAll();
    };
    reader.readAsDataURL(file);
  };

  const saveToSupabase = async () => {
    if (!fabricCanvas) return;
    setIsSaving(true);
    setSaveMessage(null);

    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from(SUPABASE_BADGE_TABLE)
        .insert({
          image_data: dataURL,
          text2_value: text2Value || "CỤM THỨ 2",
          frame_asset: 'frame.png',
        });

      if (error) {
        throw error;
      }

      setSaveMessage('Đã lưu ảnh vào Supabase thành công.');
      loadSavedBadges();
    } catch (error) {
      const message = formatSupabaseError(error);
      setSaveMessage(`Lưu thất bại: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Dropzones ---
  const { getRootProps: getUserRootProps, getInputProps: getUserInputProps } = useDropzone({
    onDrop: handleUserImageUpload,
    accept: { 'image/*': [] },
    multiple: false
  });

  // --- Setup Mode Helper ---
  // When setup mode is on, we show a visual indicator of the mask and text locations
  useEffect(() => {
    if (!fabricCanvas) return;
    
    // We can add a temporary circle to show the mask area in setup mode
    const objects = fabricCanvas.getObjects();
    const guideId = 'mask-guide';
    let guide = objects.find(o => (o as any).id === guideId);

    if (isSetupMode) {
      if (!guide) {
        guide = new fabric.Circle({
          radius: config.maskRadius,
          left: config.maskX,
          top: config.maskY,
          originX: 'center',
          originY: 'center',
          fill: 'rgba(255, 0, 0, 0.3)',
          stroke: 'red',
          strokeWidth: 2,
          selectable: false,
          evented: false,
          id: guideId,
        } as any);
        fabricCanvas.add(guide);
      } else {
        guide.set({
          radius: config.maskRadius,
          left: config.maskX,
          top: config.maskY,
        });
      }
      fabricCanvas.bringObjectToFront(guide);
    } else {
      if (guide) {
        fabricCanvas.remove(guide);
      }
    }
    fabricCanvas.requestRenderAll();
  }, [isSetupMode, config, fabricCanvas]);


  return (
    <div className="h-screen bg-gray-100 p-4 flex flex-col gap-4">
      <div className="bg-white p-2 rounded-xl shadow-sm inline-flex gap-2 w-fit">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Tạo ảnh
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'saved' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Ảnh đã lưu
        </button>
      </div>

      <div className={`${activeTab === 'editor' ? 'flex' : 'hidden'} flex-col lg:flex-row flex-1 gap-4 min-h-0`}>
          {/* Left Panel: Controls */}
          <div className="w-full lg:w-1/3 flex flex-col gap-4 bg-white p-6 rounded-xl shadow-sm overflow-y-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Công Cụ Ghép Ảnh</h1>

            {/* Uploads */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1. Tải lên Ảnh Cá Nhân</label>
                <div {...getUserRootProps()} className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-4 text-center cursor-pointer hover:bg-blue-100 transition">
                  <input {...getUserInputProps()} />
                  <div className="flex flex-col items-center gap-2 text-blue-600">
                    <Upload size={24} />
                    <span className="text-sm font-medium">Kéo thả hoặc click để chọn ảnh của bạn</span>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Text Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nhập nội dung (Cụm thứ 2)</label>
              <div className="flex items-center gap-2">
                <Type size={20} className="text-gray-400" />
                <input 
                  type="text" 
                  value={text2Value}
                  onChange={(e) => setText2Value(e.target.value)}
                  placeholder="Ví dụ: NGUYỄN VĂN A"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Setup / Calibration Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Chế độ Cấu hình (Setup Mode)</label>
              <button 
                onClick={() => setIsSetupMode(!isSetupMode)}
                aria-label="Bật hoặc tắt chế độ cấu hình"
                title="Bật hoặc tắt chế độ cấu hình"
                className={`p-2 rounded-full ${isSetupMode ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
              >
                <Settings size={20} />
              </button>
            </div>

            {isSetupMode && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
                <p className="text-xs text-gray-500 mb-2">Điều chỉnh vị trí khung tròn và văn bản để khớp với ảnh khung.</p>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-600">Vị trí Vòng tròn (Mask)</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span className="text-xs text-gray-400">X</span>
                      <input aria-label="Vị trí mask X" type="number" value={config.maskX} onChange={e => setConfig({...config, maskX: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">Y</span>
                      <input aria-label="Vị trí mask Y" type="number" value={config.maskY} onChange={e => setConfig({...config, maskY: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">Bán kính (Radius)</span>
                      <input aria-label="Bán kính mask" type="range" min="50" max="400" value={config.maskRadius} onChange={e => setConfig({...config, maskRadius: Number(e.target.value)})} className="w-full" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600">Vị trí Text 1 (DOANH SỐ)</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input aria-label="Vị trí Text 1 X" type="number" value={config.text1X} onChange={e => setConfig({...config, text1X: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                    <input aria-label="Vị trí Text 1 Y" type="number" value={config.text1Y} onChange={e => setConfig({...config, text1Y: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600">Vị trí Text 2 (Input)</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input aria-label="Vị trí Text 2 X" type="number" value={config.text2X} onChange={e => setConfig({...config, text2X: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                    <input aria-label="Vị trí Text 2 Y" type="number" value={config.text2Y} onChange={e => setConfig({...config, text2Y: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-auto pt-4">
              <button 
                onClick={saveToSupabase}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-3 rounded-lg font-semibold shadow-sm transition"
              >
                <Save size={20} />
                {isSaving ? 'Đang lưu...' : 'Lưu vào Supabase'}
              </button>
              {saveMessage && (
                <p className="mt-2 text-sm text-gray-600">{saveMessage}</p>
              )}
            </div>
          </div>

          {/* Right Panel: Canvas */}
          <div className="flex-1 bg-gray-200 rounded-xl flex items-center justify-center overflow-hidden relative shadow-inner">
            <div className="bg-white shadow-lg">
              <canvas ref={canvasRef} />
            </div>
            {!frameImage && !userImage && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-lg text-center">
                  <p className="text-gray-500 font-medium">Đang tải khung cố định...</p>
                  <p className="text-sm text-gray-400 mt-1">Vui lòng tải lên ảnh để bắt đầu</p>
                </div>
              </div>
            )}
          </div>
        </div>
      <div className={`${activeTab === 'saved' ? 'block' : 'hidden'} flex-1 bg-white rounded-xl shadow-sm p-6 overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Ảnh đã lưu trong Supabase</h2>
          <button
            onClick={loadSavedBadges}
            disabled={isLoadingSavedBadges}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
            aria-label="Tải lại danh sách ảnh đã lưu"
            title="Tải lại"
          >
            <RefreshCw size={16} className={isLoadingSavedBadges ? 'animate-spin' : ''} />
            Tải lại
          </button>
        </div>

        {savedBadgesError && (
          <p className="text-sm text-red-600">Không thể tải ảnh đã lưu: {savedBadgesError}</p>
        )}

        {!savedBadgesError && savedBadges.length === 0 && !isLoadingSavedBadges && (
          <p className="text-sm text-gray-500">Chưa có ảnh nào được lưu.</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {savedBadges.map((badge) => (
            <button
              key={badge.id}
              type="button"
              onClick={() => setSelectedBadge(badge)}
              className="border rounded-lg overflow-hidden bg-white text-left hover:shadow-md transition cursor-zoom-in"
              title="Xem ảnh rõ hơn"
            >
              <img
                src={badge.image_data}
                alt={badge.text2_value || `Badge ${badge.id}`}
                className="w-full h-44 object-cover bg-gray-50"
              />
              <div className="p-2">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {badge.text2_value || 'CỤM THỨ 2'}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(badge.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedBadge && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Xem ảnh đã lưu</h3>
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="px-3 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
              >
                Đóng
              </button>
            </div>
            <div className="p-4">
              <img
                src={selectedBadge.image_data}
                alt={selectedBadge.text2_value || `Badge ${selectedBadge.id}`}
                className="w-full h-auto rounded-lg bg-gray-50"
              />
              <div className="mt-3 text-sm text-gray-600">
                <p><strong>Nội dung:</strong> {selectedBadge.text2_value || 'CỤM THỨ 2'}</p>
                <p><strong>Thời gian lưu:</strong> {new Date(selectedBadge.created_at).toLocaleString('vi-VN')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
