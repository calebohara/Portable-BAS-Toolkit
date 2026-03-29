'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, ZoomIn, ZoomOut, Upload, Check, ImagePlus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';

interface AvatarCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (croppedBlob: Blob) => Promise<void>;
  currentAvatarUrl?: string | null;
  initials: string;
}

// Output size for cropped avatar
const OUTPUT_SIZE = 256;

export function AvatarCropDialog({
  open,
  onOpenChange,
  onUpload,
  currentAvatarUrl,
  initials,
}: AvatarCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Container size for the crop area
  const CROP_SIZE = 240;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Delay reset to allow close animation
      const t = setTimeout(() => {
        setImageSrc(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setUploading(false);
        setUploadProgress(0);
        setUploadDone(false);
        setUploadError(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      setImageSrc(src);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setUploadDone(false);

      // Pre-load image to get dimensions
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  // Mouse/touch drag handling
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!imageSrc) return;
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [imageSrc, pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [dragging, dragStart],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Wheel zoom (passive: false to allow preventDefault in React 19)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        return Math.min(Math.max(z + delta, 0.5), 5);
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Crop the image to a square using canvas
  const cropImage = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = imageRef.current;
      if (!img) return reject(new Error('No image'));

      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error('No canvas'));

      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      // Calculate how the image is displayed in the crop area
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const scale = (CROP_SIZE / minDim) * zoom;

      // Image dimensions at current zoom
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;

      // Center offset + pan
      const drawX = (CROP_SIZE - drawW) / 2 + pan.x;
      const drawY = (CROP_SIZE - drawH) / 2 + pan.y;

      // Map from crop area coords to output coords
      const outputScale = OUTPUT_SIZE / CROP_SIZE;

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Clip to circle
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        img,
        drawX * outputScale,
        drawY * outputScale,
        drawW * outputScale,
        drawH * outputScale,
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/png',
        0.92,
      );
    });
  }, [zoom, pan, CROP_SIZE]);

  const handleUpload = async () => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const blob = await cropImage();

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => {
          if (p >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return p + 10;
        });
      }, 150);

      await onUpload(blob);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadDone(true);

      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
      }, 1200);
    } catch (err) {
      setUploading(false);
      setUploadProgress(0);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const imageStyle: React.CSSProperties = (() => {
    if (imageSize.w === 0 || imageSize.h === 0) return {};
    const minDim = Math.min(imageSize.w, imageSize.h);
    const scale = (CROP_SIZE / minDim) * zoom;

    return {
      width: imageSize.w * scale,
      height: imageSize.h * scale,
      transform: `translate(${pan.x}px, ${pan.y}px)`,
      cursor: dragging ? 'grabbing' : 'grab',
    };
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Profile Picture</DialogTitle>
          <DialogDescription>
            {imageSrc ? 'Drag to reposition. Scroll or use buttons to zoom.' : 'Choose a photo for your profile.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col items-center gap-4 p-5">
            {/* Hidden canvas for cropping */}
            <canvas ref={canvasRef} className="hidden" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />

            {!imageSrc ? (
              /* No image selected — show picker */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer"
                style={{ width: CROP_SIZE, height: CROP_SIZE }}
              >
                <ImagePlus className="h-10 w-10 text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground">Click to choose photo</span>
              </button>
            ) : uploadDone ? (
              /* Upload complete */
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-full bg-primary/10"
                style={{ width: CROP_SIZE, height: CROP_SIZE }}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                  <Check className="h-8 w-8 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-primary">Upload Complete</span>
              </div>
            ) : (
              /* Image loaded — show crop area */
              <>
                <div
                  ref={containerRef}
                  className="relative overflow-hidden rounded-full border-2 border-primary/20 bg-muted"
                  style={{ width: CROP_SIZE, height: CROP_SIZE, touchAction: 'none' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageSrc}
                    alt="Crop preview"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={imageStyle}
                    draggable={false}
                  />
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5 || uploading}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleZoomIn}
                    disabled={zoom >= 5 || uploading}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {/* Upload progress */}
            {uploading && !uploadDone && (
              <div className="w-full space-y-2">
                <Progress value={uploadProgress} />
                <p className="text-xs text-center text-muted-foreground">Uploading... {uploadProgress}%</p>
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <div className="w-full flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs">{uploadError}</p>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          {!imageSrc && !uploadDone && (
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Camera className="h-4 w-4" />
              Choose Photo
            </Button>
          )}
          {imageSrc && !uploading && !uploadDone && (
            <>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Change Photo
              </Button>
              <Button onClick={handleUpload} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
