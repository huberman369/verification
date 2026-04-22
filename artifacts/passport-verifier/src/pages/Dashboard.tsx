import { useCallback, useRef, useState } from "react";
import exifr from "exifr";
import {
  Upload,
  FileImage,
  Loader2,
  Info,
  X,
  ShieldCheck,
} from "lucide-react";
import {
  loadImage,
  generateELA,
  generateNoiseMap,
} from "@/lib/imageAnalysis";

type AnalysisState = {
  fileName: string;
  fileSize: number;
  fileType: string;
  originalUrl: string;
  elaUrl: string | null;
  noiseUrl: string | null;
  width: number;
  height: number;
};

type MetadataState = {
  loading: boolean;
  data: Record<string, unknown> | null;
  error: string | null;
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function Dashboard() {
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [metadata, setMetadata] = useState<MetadataState>({
    loading: false,
    data: null,
    error: null,
  });
  const [showMetadata, setShowMetadata] = useState(false);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (JPEG / PNG / WebP).");
      return;
    }
    setError(null);
    setMetadata({ loading: false, data: null, error: null });
    setShowMetadata(false);
    setProcessing(true);
    fileRef.current = file;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const img = await loadImage(dataUrl);
        const initial: AnalysisState = {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          originalUrl: dataUrl,
          elaUrl: null,
          noiseUrl: null,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        setAnalysis(initial);

        const [ela, noise] = await Promise.all([
          generateELA(img),
          generateNoiseMap(img),
        ]);
        setAnalysis({ ...initial, elaUrl: ela, noiseUrl: noise });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to analyze image";
        setError(msg);
      } finally {
        setProcessing(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file.");
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const checkMetadata = async () => {
    if (!fileRef.current) return;
    setShowMetadata(true);
    setMetadata({ loading: true, data: null, error: null });
    try {
      const data = await exifr.parse(fileRef.current, {
        tiff: true,
        exif: true,
        gps: true,
        ifd1: true,
        iptc: true,
        xmp: true,
        icc: true,
        jfif: true,
        ihdr: true,
        translateValues: true,
        reviveValues: true,
      });
      setMetadata({ loading: false, data: data ?? {}, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to read metadata";
      setMetadata({ loading: false, data: null, error: msg });
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError(null);
    setMetadata({ loading: false, data: null, error: null });
    setShowMetadata(false);
    fileRef.current = null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Passport Verification Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Local forensic analysis · iGaming verification
            </p>
          </div>
          {analysis && (
            <button
              onClick={reset}
              className="ml-auto text-xs px-3 py-1.5 rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-muted transition"
            >
              New image
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {!analysis && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors p-16 flex flex-col items-center justify-center text-center ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-card/40 hover:border-primary/60"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileInput}
            />
            <Upload className="w-10 h-10 text-primary mb-4" />
            <p className="text-base font-medium">
              Drop a passport photo here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse · JPEG / PNG / WebP
            </p>
            {processing && (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive-foreground px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {analysis && (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
              <FileImage className="w-5 h-5 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {analysis.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {analysis.width} × {analysis.height} ·{" "}
                  {formatBytes(analysis.fileSize)} · {analysis.fileType}
                </p>
              </div>
              <button
                onClick={checkMetadata}
                disabled={metadata.loading}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {metadata.loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
                Check metadata
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <AnalysisPanel
                title="Original"
                subtitle="Uploaded image as-is"
                imageUrl={analysis.originalUrl}
                loading={false}
              />
              <AnalysisPanel
                title="ELA Analysis"
                subtitle="Error Level Analysis · highlights re-saved regions"
                imageUrl={analysis.elaUrl}
                loading={analysis.elaUrl === null}
              />
              <AnalysisPanel
                title="Noise Map"
                subtitle="High-pass residual · reveals splicing & inconsistencies"
                imageUrl={analysis.noiseUrl}
                loading={analysis.noiseUrl === null}
              />
            </div>

            {showMetadata && (
              <MetadataPanel
                metadata={metadata}
                onClose={() => setShowMetadata(false)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AnalysisPanel({
  title,
  subtitle,
  imageUrl,
  loading,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </header>
      <div className="aspect-[4/5] bg-black/40 flex items-center justify-center relative">
        {loading || !imageUrl ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Processing…</span>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-contain"
          />
        )}
      </div>
    </section>
  );
}

function MetadataPanel({
  metadata,
  onClose,
}: {
  metadata: MetadataState;
  onClose: () => void;
}) {
  const entries = metadata.data ? Object.entries(metadata.data) : [];
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center">
        <h2 className="text-sm font-semibold">Image Metadata (EXIF)</h2>
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Close metadata"
        >
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="p-5">
        {metadata.loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Reading metadata…
          </div>
        )}
        {metadata.error && (
          <p className="text-sm text-destructive">{metadata.error}</p>
        )}
        {!metadata.loading && !metadata.error && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No EXIF metadata found. This often means the file was stripped
            (e.g. re-saved by a chat app or a screenshot tool) — a strong
            forensic signal on its own.
          </p>
        )}
        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {entries.map(([key, value]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap align-top">
                      {key}
                    </td>
                    <td className="py-2 break-all">{formatValue(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
