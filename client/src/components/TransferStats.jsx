/**
 * RHEO — Live Transfer Stats Animation Panel
 * Shows chunking progress, in-flight count, retransmits, latency, pipeline.
 */
import { useEffect, useState } from 'react';
import { formatBytes, formatSpeed, formatEta } from '../utils/fileUtils';

function StatPill({ label, value, accent = false }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl ${
      accent
        ? 'bg-teal-600 text-white'
        : 'bg-slate-100 text-slate-700'
    }`}>
      <span className={`text-xs font-bold font-mono leading-none ${accent ? 'text-teal-100' : 'text-slate-900'}`}>
        {value}
      </span>
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${accent ? 'text-teal-200' : 'text-slate-500'}`}>
        {label}
      </span>
    </div>
  );
}

/**
 * Animated chunk pipeline visualiser — shows MAX_IN_FLIGHT slots
 */
function ChunkPipeline({ inFlight = 0, maxInFlight = 4 }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: maxInFlight }).map((_, i) => (
        <div
          key={i}
          className={`h-5 flex-1 rounded-md transition-all duration-300 relative overflow-hidden ${
            i < inFlight
              ? 'bg-teal-500'
              : 'bg-slate-200'
          }`}
        >
          {i < inFlight && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1s_linear_infinite]" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function TransferStats({ transfer }) {
  const {
    direction,
    status,
    fileSize,
    totalChunks,
    progress = 0,
    bytesTransferred,
    bytesReceived,
    chunksAcked,
    chunksReceived,
    speedBytesPerSecond,
    etaSeconds,
    inFlight = 0,
    latencyMs,
    retransmits = 0,
  } = transfer;

  const isSending   = direction === 'sending';
  const bytes       = isSending ? (bytesTransferred || 0) : (bytesReceived || 0);
  const chunksTotal = totalChunks || Math.ceil(fileSize / (1024 * 1024));
  const chunksDone  = isSending ? (chunksAcked || 0) : (chunksReceived || 0);

  // Pulsing dot count for animation
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    if (status !== 'TRANSFERRING') return;
    const id = setInterval(() => setDotCount(d => (d + 1) % 4), 400);
    return () => clearInterval(id);
  }, [status]);

  const dots = '.'.repeat(dotCount);

  if (status !== 'TRANSFERRING' && status !== 'ACCEPTED') return null;

  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3.5 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Animated streaming icon */}
          <div className="relative w-6 h-6 flex items-center justify-center">
            <span className="absolute w-6 h-6 rounded-full bg-teal-500/20 animate-ping" />
            <span className="w-3 h-3 rounded-full bg-teal-600 relative z-10" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 font-mono">
              {isSending ? 'Streaming chunks' : 'Receiving chunks'}{dots}
            </span>
            <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
              {transfer.transferMode === 'LOCAL_P2P' || transfer.isZeroData ? (
                <>
                  <span>⚡ Direct LAN (0 Data Used)</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500 font-normal">No internet consumed</span>
                </>
              ) : (
                <span className="text-slate-500 font-normal">🌐 Cloud Relay Active</span>
              )}
            </div>
          </div>
        </div>
        <span className="text-xs font-extrabold text-teal-700 font-mono">
          {formatBytes(bytes)} / {formatBytes(fileSize)}
        </span>
      </div>

      {/* Main progress bar with chunk tick marks */}
      <div>
        <div className="h-4 bg-slate-200 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-300 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-0 h-full w-6 bg-gradient-to-r from-transparent to-white/30" />
          </div>
          {/* Chunk tick overlay */}
          {chunksTotal > 0 && chunksTotal <= 50 && (
            <div className="absolute inset-0 flex">
              {Array.from({ length: chunksTotal }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-white/30 last:border-r-0"
                />
              ))}
            </div>
          )}
        </div>

        {/* Chunk text */}
        <div className="flex justify-between text-[11px] font-mono mt-1.5">
          <span className="text-slate-500">
            Chunk <span className="font-bold text-slate-800">{chunksDone}</span> / {chunksTotal}
          </span>
          <span className="font-extrabold text-teal-700">{progress}%</span>
        </div>
      </div>

      {/* In-flight pipeline visualiser */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-slate-600 uppercase tracking-wider">In-Flight Pipeline</span>
          <span className="font-bold text-slate-700 font-mono">{inFlight} / 4 slots</span>
        </div>
        <ChunkPipeline inFlight={inFlight} maxInFlight={4} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill
          label="Speed"
          value={speedBytesPerSecond ? formatSpeed(speedBytesPerSecond) : '—'}
          accent
        />
        <StatPill
          label="ETA"
          value={etaSeconds != null ? formatEta(etaSeconds) : '—'}
        />
        <StatPill
          label="Latency"
          value={latencyMs != null ? `${latencyMs}ms` : '—'}
        />
        <StatPill
          label="Retransmit"
          value={retransmits}
        />
      </div>
    </div>
  );
}
