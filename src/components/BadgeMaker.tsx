import { useState, useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { RefreshCw, Upload, Save, Settings, Type, Edit2, Trash2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { getSupabaseClient, SUPABASE_BADGE_SAVED_VIEW, SUPABASE_BADGE_TABLE } from '../lib/supabase';
import VinhDanh from './VinhDanh';

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
  text2Y: 715,
  text1Content: "DOANH SỐ",
  text1Color: "#FFFFFF",
  text2Color: "#FFFFFF",
  textFontSize: 40,
};

const FIXED_FRAME_URL = new URL('../../frame.png', import.meta.url).href;
const TOP1_FRAME_URL = new URL('../../top 1.png', import.meta.url).href;
const TOP2_FRAME_URL = new URL('../../top 2.png', import.meta.url).href;
const TOP3_FRAME_URL = new URL('../../top 3.png', import.meta.url).href;

type SavedBadge = {
  id: number;
  image_data: string;
  text2_value: string | null;
  created_at: string;
};

type ActiveTab = 'editor' | 'saved' | 'vinhdanh';

export default function BadgeMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [userImage, setUserImage] = useState<fabric.Image | null>(null);
  const [frameImage, setFrameImage] = useState<fabric.Image | null>(null);
  const [text1Object, setText1Object] = useState<fabric.IText | null>(null);
  const [text2Object, setText2Object] = useState<fabric.IText | null>(null);
  
  const [text1Value, setText1Value] = useState("DOANH SỐ");
  const [text2Value, setText2Value] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedBadges, setSavedBadges] = useState<SavedBadge[]>([]);
  const [isLoadingSavedBadges, setIsLoadingSavedBadges] = useState(false);
  const [savedBadgesError, setSavedBadgesError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<SavedBadge | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [editingBadge, setEditingBadge] = useState<SavedBadge | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  
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

  const removeBackgroundAndTrim = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = image.width;
        sourceCanvas.height = image.height;
        const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

        if (!sourceCtx) {
          reject(new Error('Không thể tạo context để xử lý ảnh.'));
          return;
        }

        sourceCtx.drawImage(image, 0, 0);
        const imageData = sourceCtx.getImageData(0, 0, image.width, image.height);
        const { data, width, height } = imageData;

        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        // Improved background detection - check for white/light gray backgrounds
        // Also check corners to determine background color
        const cornerColors: number[][] = [];
        const cornerPositions = [
          [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]
        ];
        
        cornerPositions.forEach(([x, y]) => {
          const idx = (y * width + x) * 4;
          cornerColors.push([data[idx], data[idx + 1], data[idx + 2]]);
        });

        // Calculate average background color from corners
        const avgBg = cornerColors.reduce(
          (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
          [0, 0, 0]
        ).map(v => v / cornerColors.length);

        // Threshold for background detection (more lenient)
        const bgThreshold = 30;

        // Process image to remove background and find bounds
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];

            // Check if pixel is transparent
            const isTransparent = a <= 10;
            
            // Check if pixel matches background color (with threshold)
            const colorDiff = Math.abs(r - avgBg[0]) + Math.abs(g - avgBg[1]) + Math.abs(b - avgBg[2]);
            const isBackgroundColor = colorDiff < bgThreshold;
            
            // Check if pixel is near white (fallback)
            const isNearWhite = r >= 240 && g >= 240 && b >= 240 && a > 200;
            
            // Check if pixel is light gray background
            const isLightGray = r >= 230 && g >= 230 && b >= 230 && a > 200;
            
            const isBackgroundPixel = isTransparent || isBackgroundColor || isNearWhite || isLightGray;

            if (!isBackgroundPixel) {
              // This is a foreground pixel
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            } else {
              // Make background transparent
              data[index + 3] = 0; // Set alpha to 0
            }
          }
        }

        // Update image data with transparent background
        sourceCtx.putImageData(imageData, 0, 0);

        if (maxX < minX || maxY < minY) {
          // No foreground found, return original with transparent background
          resolve(sourceCanvas.toDataURL('image/png'));
          return;
        }

        // Add padding
        const padding = 5;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2);
        
        // Cut image at text1 position (DOANH SỐ) - cut below text1
        const text1Bottom = config.text1Y + (config.textFontSize / 2) + 30; // text1Y + half font size + padding below
        const maxHeightFromContent = maxY - minY + 1 + padding * 2;
        const cropHeight = Math.min(
          height - cropY, 
          Math.min(maxHeightFromContent, text1Bottom - cropY)
        );

        // Create output canvas with transparent background
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = cropWidth;
        outputCanvas.height = cropHeight;
        const outputCtx = outputCanvas.getContext('2d');

        if (!outputCtx) {
          reject(new Error('Không thể tạo canvas xuất ảnh.'));
          return;
        }

        // Clear canvas (transparent)
        outputCtx.clearRect(0, 0, cropWidth, cropHeight);
        
        // Draw cropped image
        outputCtx.drawImage(
          sourceCanvas, 
          cropX, cropY, cropWidth, cropHeight, 
          0, 0, cropWidth, cropHeight
        );
        
        resolve(outputCanvas.toDataURL('image/png'));
      };

      image.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh để xử lý.'));
      image.src = dataUrl;
    });
  };

  const loadSavedBadges = useCallback(async () => {
    setIsLoadingSavedBadges(true);
    setSavedBadgesError(null);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(SUPABASE_BADGE_SAVED_VIEW)
        .select('id, image_data, text2_value, created_at')
        .order('created_at', { ascending: false });

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

  const deleteBadge = async (badgeId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ảnh này?')) {
      return;
    }

    setIsDeleting(badgeId);
    setSaveMessage(null);
    
    try {
      const supabase = getSupabaseClient();
      console.log('Deleting badge with ID:', badgeId);
      console.log('Using table:', SUPABASE_BADGE_TABLE);
      
      const { data, error } = await supabase
        .from(SUPABASE_BADGE_TABLE)
        .delete()
        .eq('id', badgeId)
        .select();

      console.log('Delete response:', { data, error });

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      // Reload badges after deletion
      await loadSavedBadges();
      if (selectedBadge?.id === badgeId) {
        setSelectedBadge(null);
      }
      setSaveMessage('Đã xóa ảnh thành công.');
    } catch (error) {
      console.error('Error deleting badge:', error);
      const errorMessage = formatSupabaseError(error);
      setSaveMessage(`Lỗi khi xóa: ${errorMessage}`);
      alert(`Lỗi khi xóa: ${errorMessage}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const editBadge = (badge: SavedBadge) => {
    setEditingBadge(badge);
    setActiveTab('editor');
    
    // Load image into canvas
    if (fabricCanvas && badge.image_data) {
      fabric.Image.fromURL(badge.image_data, (img) => {
        // Clear existing user image
        if (userImage) {
          fabricCanvas.remove(userImage);
        }
        
        // Add the loaded image
        img.set({
          left: config.canvasWidth / 2,
          top: config.canvasHeight / 2,
          originX: 'center',
          originY: 'center',
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
        });
        
        fabricCanvas.add(img);
        setUserImage(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.requestRenderAll();
      });
    }
  };

  const updateBadge = async () => {
    if (!editingBadge || !fabricCanvas) return;
    
    setIsSaving(true);
    setSaveMessage(null);

    const rawDataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    const dataURL = await removeBackgroundAndTrim(rawDataURL);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from(SUPABASE_BADGE_TABLE)
        .update({
          image_data: dataURL,
          text2_value: text2Value || "",
        })
        .eq('id', editingBadge.id);

      if (error) {
        throw error;
      }

      setSaveMessage('Đã cập nhật ảnh thành công.');
      setEditingBadge(null);
      await loadSavedBadges();
    } catch (error) {
      const message = formatSupabaseError(error);
      setSaveMessage(`Cập nhật thất bại: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

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

  // Handle Text 1 updates
  useEffect(() => {
    if (text1Object && fabricCanvas) {
      text1Object.set({ text: text1Value || "DOANH SỐ" });
      text1Object.set({ left: config.text1X });
      fabricCanvas.requestRenderAll();
    }
  }, [text1Value, text1Object, fabricCanvas, config.text1X]);

  // Handle Text 2 updates
  useEffect(() => {
    if (text2Object && fabricCanvas) {
      text2Object.set({ text: text2Value || "" });
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

    // Ensure frame is always on top
    if (frameImage) {
      fabricCanvas.bringObjectToFront(frameImage);
    }

    fabricCanvas.requestRenderAll();
  }, [config, fabricCanvas, userImage]);

  const setupDefaultObjects = async (canvas: fabric.Canvas) => {
    // 1. Add Text 1 (Editable)
    const text1 = new fabric.IText(config.text1Content, {
      left: config.text1X,
      top: config.text1Y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fontSize: config.textFontSize,
      fontWeight: 'bold',
      fill: config.text1Color,
      selectable: true,
      evented: true,
      id: 'text1', // Custom ID for retrieval
    } as any);
    canvas.add(text1);
    setText1Object(text1);

    // 2. Add Text 2 (Editable)
    const text2 = new fabric.IText("", {
      left: config.text2X,
      top: config.text2Y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fontSize: config.textFontSize,
      fontWeight: 'bold',
      fill: config.text2Color,
      selectable: true,
      evented: true,
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
      // Frame should be on top, texts below frame
      canvas.bringObjectToFront(text1);
      canvas.bringObjectToFront(text2);
      canvas.bringObjectToFront(frame);
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

      // Keep layer order stable: User Image < Text < Frame (Frame on top)
      fabricCanvas.moveObjectTo(img, 0);
      const text1 = fabricCanvas.getObjects().find(o => (o as any).id === 'text1');
      const text2 = fabricCanvas.getObjects().find(o => (o as any).id === 'text2');
      if (text1) {
        fabricCanvas.bringObjectToFront(text1);
      }
      if (text2) {
        fabricCanvas.bringObjectToFront(text2);
      }
      if (frameImage) {
        fabricCanvas.bringObjectToFront(frameImage); // Frame must be on top
      }
      
      fabricCanvas.setActiveObject(img);
      fabricCanvas.requestRenderAll();
    };
    reader.readAsDataURL(file);
  };

  const createImageWithFrame = async (frameUrl: string, frameName: string): Promise<string> => {
    if (!fabricCanvas) throw new Error('Canvas not available');
    
    // Get current frame image from canvas (not state, to avoid race conditions)
    const objects = fabricCanvas.getObjects();
    const currentFrame = objects.find(o => o === frameImage) as fabric.Image;
    
    // Load new frame
    const newFrame = await fabric.Image.fromURL(frameUrl);
    newFrame.set({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      scaleX: config.canvasWidth / (newFrame.width || 1),
      scaleY: config.canvasHeight / (newFrame.height || 1),
    });
    
    // Replace frame
    if (currentFrame) {
      fabricCanvas.remove(currentFrame);
    }
    fabricCanvas.add(newFrame);
    fabricCanvas.moveObjectTo(newFrame, 0);
    
    // Ensure frame is on top
    const text1 = fabricCanvas.getObjects().find(o => (o as any).id === 'text1');
    if (text1) {
      fabricCanvas.bringObjectToFront(text1);
    }
    fabricCanvas.bringObjectToFront(newFrame); // Frame must be on top
    
    fabricCanvas.requestRenderAll();
    
    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Export image
    const rawDataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    const dataURL = await removeBackgroundAndTrim(rawDataURL);
    
    // Restore original frame
    if (currentFrame) {
      fabricCanvas.remove(newFrame);
      fabricCanvas.add(currentFrame);
      fabricCanvas.moveObjectTo(currentFrame, 0);
      if (text1) {
        fabricCanvas.bringObjectToFront(text1);
      }
      fabricCanvas.bringObjectToFront(currentFrame); // Frame must be on top
      fabricCanvas.requestRenderAll();
      // Wait a bit for restore to complete
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return dataURL;
  };

  const saveToSupabase = async () => {
    if (!fabricCanvas) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const supabase = getSupabaseClient();
      
      // Create 3 images with different frames (sequentially to avoid race conditions)
      const image1 = await createImageWithFrame(TOP1_FRAME_URL, 'top 1.png');
      const image2 = await createImageWithFrame(TOP2_FRAME_URL, 'top 2.png');
      const image3 = await createImageWithFrame(TOP3_FRAME_URL, 'top 3.png');

      // Save all 3 images to database
      const { error } = await supabase
        .from(SUPABASE_BADGE_TABLE)
        .insert([
          {
            image_data: image1,
            text2_value: text2Value || "",
            frame_asset: 'top 1.png',
          },
          {
            image_data: image2,
            text2_value: text2Value || "",
            frame_asset: 'top 2.png',
          },
          {
            image_data: image3,
            text2_value: text2Value || "",
            frame_asset: 'top 3.png',
          },
        ]);

      if (error) {
        throw error;
      }

      setSaveMessage('Đã tạo và lưu 3 ảnh vào Supabase thành công.');
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
        <button
          onClick={() => setActiveTab('vinhdanh')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'vinhdanh' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Vinh Danh
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

            {/* Text Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text 1 (DOANH SỐ)</label>
                <div className="flex items-center gap-2">
                  <Type size={20} className="text-gray-400" />
                  <input 
                    type="text" 
                    value={text1Value}
                    onChange={(e) => setText1Value(e.target.value)}
                    placeholder="DOANH SỐ"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text 2</label>
                <div className="flex items-center gap-2">
                  <Type size={20} className="text-gray-400" />
                  <input 
                    type="text" 
                    value={text2Value}
                    onChange={(e) => setText2Value(e.target.value)}
                    placeholder="Nhập nội dung"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
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
                  <label className="block text-xs font-semibold text-gray-600">Vị trí Text 2</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input aria-label="Vị trí Text 2 X" type="number" value={config.text2X} onChange={e => setConfig({...config, text2X: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                    <input aria-label="Vị trí Text 2 Y" type="number" value={config.text2Y} onChange={e => setConfig({...config, text2Y: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                  </div>
                </div>

              </div>
            )}

            {/* Editing Badge Info */}
            {editingBadge && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-800 mb-1">Đang chỉnh sửa ảnh</p>
                <p className="text-xs text-gray-600">
                  <strong>Doanh số:</strong> {editingBadge.text2_value || 'Chưa có'}
                </p>
                <p className="text-xs text-gray-600">
                  <strong>Thời gian tạo:</strong> {new Date(editingBadge.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            )}

            <div className="mt-auto pt-4 space-y-2">
              {editingBadge ? (
                <>
                  <button 
                    onClick={updateBadge}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-lg font-semibold shadow-sm transition"
                  >
                    <Save size={20} />
                    {isSaving ? 'Đang cập nhật...' : 'Cập nhật ảnh'}
                  </button>
                  <button 
                    onClick={() => {
                      setEditingBadge(null);
                      if (userImage && fabricCanvas) {
                        fabricCanvas.remove(userImage);
                        setUserImage(null);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg font-semibold shadow-sm transition"
                  >
                    Hủy chỉnh sửa
                  </button>
                </>
              ) : (
                <button 
                  onClick={saveToSupabase}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-3 rounded-lg font-semibold shadow-sm transition"
                >
                  <Save size={20} />
                  {isSaving ? 'Đang lưu...' : 'Lưu vào Supabase'}
                </button>
              )}
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

        {saveMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            saveMessage.includes('thành công') 
              ? 'bg-green-100 text-green-700 border border-green-300' 
              : 'bg-red-100 text-red-700 border border-red-300'
          }`}>
            {saveMessage}
          </div>
        )}

        {!savedBadgesError && savedBadges.length === 0 && !isLoadingSavedBadges && (
          <p className="text-sm text-gray-500">Chưa có ảnh nào được lưu.</p>
        )}

        {/* Group badges by text2_value (tên nhân sự) */}
        {!savedBadgesError && savedBadges.length > 0 && (() => {
          const groupedBadges = savedBadges.reduce((acc, badge) => {
            const name = badge.text2_value || 'Chưa có tên';
            if (!acc[name]) {
              acc[name] = [];
            }
            acc[name].push(badge);
            return acc;
          }, {} as Record<string, SavedBadge[]>);

          return (
            <div className="space-y-6">
              {Object.entries(groupedBadges).map(([name, badges]) => (
                <div key={name} className="border rounded-lg overflow-hidden bg-gray-50">
                  {/* Group Header */}
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 border-b">
                    <h3 className="text-lg font-bold text-white">{name}</h3>
                    <p className="text-sm text-blue-100">{badges.length} ảnh</p>
                  </div>
                  
                  {/* Badges Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                    {badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition relative group"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            // Don't open modal if clicking on action buttons
                            if ((e.target as HTMLElement).closest('.action-buttons')) {
                              return;
                            }
                            setSelectedBadge(badge);
                          }}
                          className="w-full text-left"
                          title="Xem ảnh rõ hơn"
                        >
                          <img
                            src={badge.image_data}
                            alt={name}
                            className="w-full h-44 object-cover bg-gray-50"
                          />
                          <div className="p-2">
                            <p className="text-xs text-gray-500">
                              {new Date(badge.created_at).toLocaleString('vi-VN')}
                            </p>
                          </div>
                        </button>
                        
                        {/* Action Buttons */}
                        <div className="action-buttons absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              editBadge(badge);
                            }}
                            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-lg transition"
                            title="Sửa ảnh"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Delete button clicked for badge:', badge.id);
                              await deleteBadge(badge.id);
                            }}
                            disabled={isDeleting === badge.id}
                            className="p-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-md shadow-lg transition z-10"
                            title="Xóa ảnh"
                          >
                            {isDeleting === badge.id ? (
                              <RefreshCw size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Vinh Danh Tab */}
      <div className={`${activeTab === 'vinhdanh' ? 'block' : 'hidden'} flex-1 overflow-hidden`}>
        <VinhDanh />
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
                <p><strong>Thời gian lưu:</strong> {new Date(selectedBadge.created_at).toLocaleString('vi-VN')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
