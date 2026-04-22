import { useCallback, useRef, useState } from "react";
import exifr from "exifr";
import {
  Upload,
  FileImage,
  Loader2,
  Info,
  X,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { analyzeImage, loadImage, type AnalysisResult } from "@/lib/imageAnalysis";

type AnalysisState = {
  fileName: string;
  fileSize: number;
  fileType: string;
  originalUrl: string;
  width: number;
  height: number;
  result: AnalysisResult | null;
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

function scoreVerdict(s: number): { label: string; color: string; ring: string } {
  if (s < 25) return { label: "Likely authentic", color: "text-emerald-400", ring: "ring-emerald-500/40" };
  if (s < 55) return { label: "Inspect carefully", color: "text-amber-400", ring: "ring-amber-500/40" };
  return { label: "Highly suspicious", color: "text-red-400", ring: "ring-red-500/50" };
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
          width: img.naturalWidth,
          height: img.naturalHeight,
          result: null,
        };
        setAnalysis(initial);
        const result = await analyzeImage(img);
        setAnalysis({ ...initial, result });
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

  const result = analysis?.result;
  const verdict = result ? scoreVerdict(result.score) : null;

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
              {result && (
                <div className="text-xs text-muted-foreground hidden md:flex items-center gap-4 ml-2">
                  <span>
                    ELA anomalies:{" "}
                    <span className="text-foreground font-medium">
                      {(result.anomalyRatio * 100).toFixed(2)}%
                    </span>
                  </span>
                  <span>
                    Copy-move matches:{" "}
                    <span className="text-foreground font-medium">
                      {result.copyMoveMatches}
                    </span>
                  </span>
                </div>
              )}
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
                imageUrl={result?.elaUrl ?? null}
                loading={!result}
              />
              <AnalysisPanel
                title="Noise Map"
                subtitle="High-pass residual · reveals splicing & inconsistencies"
                imageUrl={result?.noiseUrl ?? null}
                loading={!result}
              />
              <AnalysisPanel
                title="Anomaly Highlighter"
                subtitle="Red mask over regions of abnormal compression"
                imageUrl={result?.anomalyOverlayUrl ?? null}
                loading={!result}
                badge={
                  result
                    ? `${(result.anomalyRatio * 100).toFixed(2)}% flagged`
                    : undefined
                }
              />
              <AnalysisPanel
                title="Copy-Move Detection"
                subtitle="Linked yellow boxes mark suspected cloned regions"
                imageUrl={result?.copyMoveOverlayUrl ?? null}
                loading={!result}
                badge={
                  result
                    ? `${result.copyMoveMatches} match${result.copyMoveMatches === 1 ? "" : "es"}`
                    : undefined
                }
                emptyHint={
                  result && result.copyMoveMatches === 0
                    ? "No clone-stamp patterns detected."
                    : undefined
                }
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

      {verdict && result && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-2xl border border-border bg-card/95 backdrop-blur shadow-2xl ring-2 ${verdict.ring} px-5 py-4 flex items-center gap-4`}
        >
          <div
            className={`w-16 h-16 rounded-full bg-background border border-border flex items-center justify-center ${verdict.color}`}
          >
            <span className="text-2xl font-bold tabular-nums">
              {result.score}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Verdict score
            </p>
            <p className={`text-sm font-semibold ${verdict.color}`}>
              {verdict.label}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              0 = clean · 100 = highly suspicious
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({
  title,
  subtitle,
  imageUrl,
  loading,
  badge,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  loading: boolean;
  badge?: string;
  emptyHint?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <header className="px-4 py-3 border-b border-border flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {badge && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border">
            {badge}
          </span>
        )}
      </header>
      <div className="aspect-[4/5] bg-black/40 flex items-center justify-center relative">
        {loading || !imageUrl ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Processing…</span>
          </div>
        ) : (
          <>
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-contain"
            />
            {emptyHint && (
              <div className="absolute bottom-2 left-2 right-2 text-[11px] text-emerald-300 bg-emerald-950/70 border border-emerald-800 rounded px-2 py-1 text-center">
                {emptyHint}
              </div>
            )}
          </>
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
          <div className="flex items-start gap-2 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              No EXIF metadata found. This often means the file was stripped
              (e.g. re-saved by a chat app or a screenshot tool) — a strong
              forensic signal on its own.
            </p>
          </div>
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
