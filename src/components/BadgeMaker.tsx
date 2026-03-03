import { useState, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { Upload, Download, Settings, Type, Image as ImageIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

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

export default function BadgeMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [userImage, setUserImage] = useState<fabric.Image | null>(null);
  const [frameImage, setFrameImage] = useState<fabric.Image | null>(null);
  const [text2Object, setText2Object] = useState<fabric.IText | null>(null);
  
  const [text2Value, setText2Value] = useState("");
  const [isSetupMode, setIsSetupMode] = useState(false);
  
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

    // 3. Try to load default frame if exists
    // We'll skip auto-loading for now and let user upload or rely on placeholder logic if we had one.
    // But to make it usable immediately, let's add a placeholder rectangle as a "Frame" if no image is uploaded.
    // Actually, let's just wait for upload.
  };

  // --- File Handling ---

  const handleFrameUpload = (files: File[]) => {
    if (!fabricCanvas || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      const img = await fabric.Image.fromURL(result);
      
      // Remove old frame if exists
      if (frameImage) {
        fabricCanvas.remove(frameImage);
      }

      // Configure Frame
      img.set({
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false, // Frame should not be moved by user
        evented: false,    // Clicks pass through to user image
        scaleX: config.canvasWidth / (img.width || 1),
        scaleY: config.canvasHeight / (img.height || 1),
      });

      // Frame must be on top.
      // We add it, then ensure z-index.
      canvasRef.current && fabricCanvas.add(img);
      setFrameImage(img);
      
      // Ensure frame is always on top of user image but below text? 
      // Usually Text is on top of Frame (ribbons).
      // Order: User Image < Frame < Text
      fabricCanvas.moveObjectTo(img, 1); // Index 1 (assuming UserImage is 0)
      
      // Re-arrange stack
      if (userImage) fabricCanvas.moveObjectTo(userImage, 0);
      const text1 = fabricCanvas.getObjects().find(o => (o as any).id === 'text1');
      const text2 = fabricCanvas.getObjects().find(o => (o as any).id === 'text2');
      if (text1) fabricCanvas.bringObjectToFront(text1);
      if (text2) fabricCanvas.bringObjectToFront(text2);
      
      fabricCanvas.requestRenderAll();
    };
    reader.readAsDataURL(file);
  };

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

      // Send to back
      fabricCanvas.sendObjectToBack(img);
      
      fabricCanvas.setActiveObject(img);
      fabricCanvas.requestRenderAll();
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = () => {
    if (!fabricCanvas) return;
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    const link = document.createElement('a');
    link.download = 'badge-result.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Dropzones ---
  const { getRootProps: getFrameRootProps, getInputProps: getFrameInputProps } = useDropzone({
    onDrop: handleFrameUpload,
    accept: { 'image/*': [] },
    multiple: false
  });

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
    <div className="flex flex-col lg:flex-row h-screen bg-gray-100 p-4 gap-4">
      {/* Left Panel: Controls */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4 bg-white p-6 rounded-xl shadow-sm overflow-y-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Công Cụ Ghép Ảnh</h1>

        {/* Uploads */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">1. Tải lên Khung (Frame)</label>
            <div {...getFrameRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition">
              <input {...getFrameInputProps()} />
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <ImageIcon size={24} />
                <span className="text-sm">Kéo thả hoặc click để chọn ảnh khung</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Tải lên Ảnh Cá Nhân</label>
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
                  <input type="number" value={config.maskX} onChange={e => setConfig({...config, maskX: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                </div>
                <div>
                  <span className="text-xs text-gray-400">Y</span>
                  <input type="number" value={config.maskY} onChange={e => setConfig({...config, maskY: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-gray-400">Bán kính (Radius)</span>
                  <input type="range" min="50" max="400" value={config.maskRadius} onChange={e => setConfig({...config, maskRadius: Number(e.target.value)})} className="w-full" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600">Vị trí Text 1 (DOANH SỐ)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input type="number" value={config.text1X} onChange={e => setConfig({...config, text1X: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                <input type="number" value={config.text1Y} onChange={e => setConfig({...config, text1Y: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600">Vị trí Text 2 (Input)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input type="number" value={config.text2X} onChange={e => setConfig({...config, text2X: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
                <input type="number" value={config.text2Y} onChange={e => setConfig({...config, text2Y: Number(e.target.value)})} className="w-full border rounded px-2 py-1" />
              </div>
            </div>
          </div>
        )}

        <div className="mt-auto pt-4">
          <button 
            onClick={downloadImage}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold shadow-sm transition"
          >
            <Download size={20} />
            Tải Xuống (PNG)
          </button>
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
              <p className="text-gray-500 font-medium">Khung xem trước sẽ hiển thị tại đây</p>
              <p className="text-sm text-gray-400 mt-1">Vui lòng tải lên khung và ảnh để bắt đầu</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
