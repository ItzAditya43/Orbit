import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { ImageIcon, XIcon } from "../icons";

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

// Drop this anywhere an image should be attachable: it renders existing attachments plus an
// "Add image" button, and — the actual point of it — accepts a plain Ctrl+V paste (from a
// screenshot, a copied image, anything on the clipboard) or drag-and-drop directly onto it,
// with no separate upload step required.
export function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => api.attachments.list(entityType, entityId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });

  const upload = async (file: Blob, filename?: string) => {
    if (!ACCEPTED.includes(file.type)) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await api.attachments.upload({ dataUrl, entityType, entityId, filename });
      invalidate();
    } finally {
      setUploading(false);
    }
  };

  const uploadMany = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) await upload(f, f.name);
  };

  return (
    <div
      onPaste={(e) => {
        const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
        if (items.length === 0) return;
        e.preventDefault();
        for (const item of items) {
          const file = item.getAsFile();
          if (file) upload(file);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) uploadMany(e.dataTransfer.files);
      }}
      tabIndex={0}
      className={`space-y-2 rounded-lg p-2 outline-none ${dragging ? "ring-2 ring-neutral-400 bg-neutral-50 dark:bg-neutral-800/50" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 flex items-center gap-1 text-neutral-500"
        >
          <ImageIcon size={12} /> Add image
        </button>
        <span className="text-[11px] text-neutral-400">or paste (Ctrl+V) / drag an image here</span>
        {uploading && <span className="text-[11px] text-neutral-400">Uploading...</span>}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadMany(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              <img
                src={api.attachments.rawUrl(a.id)}
                alt={a.filename}
                onClick={() => setLightbox(api.attachments.rawUrl(a.id))}
                className="h-16 w-16 object-cover rounded-md border border-neutral-200 dark:border-neutral-800 cursor-zoom-in"
              />
              <button
                onClick={async () => {
                  await api.attachments.remove(a.id);
                  invalidate();
                }}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 opacity-0 group-hover:opacity-100 flex items-center justify-center"
              >
                <XIcon size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
