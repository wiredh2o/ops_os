import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { X, Camera, Upload, Eye, EyeOff, Images, Loader2 } from 'lucide-react';

export type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  removeBg: boolean;
};

export type ExistingPhoto = {
  id: string;
  file_path: string;
  previewUrl?: string;
  isExisting: true;
};

interface PhotoUploaderProps {
  onChange: (items: SelectedPhoto[]) => void;
  multiple?: boolean;
  allowCamera?: boolean;
  enableBgRemovalToggle?: boolean;
  existingPhotos?: ExistingPhoto[];
  existingImageCount?: number;
  showExistingImages?: boolean;
  onToggleExistingImages?: (show: boolean) => void;
  loadingExistingImages?: boolean;
  isEditMode?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  onChange,
  multiple = true,
  allowCamera = true,
  enableBgRemovalToggle = true,
  existingPhotos = [],
  existingImageCount = 0,
  showExistingImages = false,
  onToggleExistingImages,
  loadingExistingImages = false,
  isEditMode = false,
}) => {
  const [items, setItems] = useState<SelectedPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: SelectedPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Unsupported file', description: 'Please select image files only.' });
        continue;
      }
      const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      newItems.push({ id, file, previewUrl, removeBg: false });
    }

    setItems((prev) => {
      const next = multiple ? [...prev, ...newItems] : [...newItems];
      onChange(next);
      return next;
    });
  }, [multiple, onChange]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      onChange(next);
      return next;
    });
  }, [onChange]);

  const toggleBg = useCallback((id: string, value: boolean) => {
    setItems((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, removeBg: value } : p));
      onChange(next);
      return next;
    });
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Existing images control - only show in edit mode */}
      {isEditMode && existingImageCount > 0 && (
        <Card className="p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Images className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {existingImageCount} existing image{existingImageCount !== 1 ? 's' : ''} attached
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onToggleExistingImages?.(!showExistingImages)}
              disabled={loadingExistingImages}
              className="flex items-center gap-2"
            >
              {loadingExistingImages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : showExistingImages ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {loadingExistingImages ? 'Loading...' : showExistingImages ? 'Hide Images' : 'Show Images'}
            </Button>
          </div>
          {!showExistingImages && (
            <p className="text-xs text-muted-foreground mt-2">
              Images not loaded to save bandwidth
            </p>
          )}
        </Card>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-md border border-dashed px-6 py-3 text-center cursor-pointer hover:bg-muted/40 hover:shadow-lg hover:shadow-primary/20 hover:border-primary/30 transition-all duration-200"
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Camera className="h-8 w-8 text-muted-foreground" />
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Take photo or upload images</p>
            <p className="text-xs text-muted-foreground mt-1">Drag & drop images here, or click to select</p>
          </div>
        </div>
        <Input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={onPick}
          className="hidden"
          capture={allowCamera ? "environment" : undefined}
        />
      </div>

      {(items.length > 0 || (showExistingImages && existingPhotos.length > 0)) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Render existing photos first - only when showExistingImages is true */}
          {showExistingImages && existingPhotos.map((photo) => (
            <Card key={photo.id} className="relative overflow-hidden">
              <div className="absolute left-2 top-2 z-10 bg-background/80 backdrop-blur border rounded px-2 py-1">
                <span className="text-xs text-muted-foreground">Existing</span>
              </div>
              <img
                src={photo.previewUrl || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/repairs-intake/${photo.file_path}`}
                alt="Existing repair photo"
                className="w-full h-36 object-cover"
                loading="lazy"
              />
            </Card>
          ))}
          
          {/* Render new photos */}
          {items.map((item) => (
            <Card key={item.id} className="relative overflow-hidden">
              <button
                type="button"
                aria-label="Remove"
                onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur border shadow"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={item.previewUrl}
                alt="Selected upload preview"
                className="w-full h-36 object-cover"
                loading="lazy"
              />
              {enableBgRemovalToggle && (
                <div className="flex items-center justify-between p-2 border-t">
                  <Label htmlFor={`bg-${item.id}`} className="text-xs">Remove background</Label>
                  <Switch id={`bg-${item.id}`} checked={item.removeBg} onCheckedChange={(v) => toggleBg(item.id, v)} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {(items.length > 0 || (showExistingImages && existingPhotos.length > 0)) && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {showExistingImages && existingPhotos.length > 0 && `${existingPhotos.length} existing, `}
            {items.length} new image(s) selected
          </div>
          {items.length > 0 && (
            <Button type="button" variant="secondary" onClick={() => setItems([])}>Clear New</Button>
          )}
        </div>
      )}
    </div>
  );
};
