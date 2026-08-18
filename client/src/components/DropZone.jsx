/**
 * RHEO — File Drop Zone Component
 * Clean off-white drag and drop area with teal accents.
 */
import { useCallback, useRef, useState } from 'react';
import { formatBytes } from '../utils/fileUtils';

export default function DropZone({ file, onFileSelect }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (onFileSelect) onFileSelect(f);
  }, [onFileSelect]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div>
      <div
        id="drop-zone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-3xl p-8 flex flex-col items-center gap-3.5
          text-center transition-all duration-200 bg-white
          ${dragging
            ? 'drop-zone-active'
            : 'border-slate-200 hover:border-teal-500 hover:bg-teal-50/20'}`}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
          dragging
            ? 'bg-teal-500/20 text-teal-600 scale-110'
            : 'bg-teal-50 text-teal-600'
        }`}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        {file ? (
          <div className="space-y-1">
            <p className="font-extrabold text-sm text-slate-900 truncate max-w-[280px] sm:max-w-md">{file.name}</p>
            <p className="text-xs font-semibold text-teal-700 font-mono">{formatBytes(file.size)}</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">Click to choose a different file</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-bold text-sm text-slate-800">Drop files to flow or <span className="text-teal-600 underline">browse</span></p>
            <p className="text-xs text-slate-400 font-medium">Any format · High-Speed Binary Streaming · Up to 5 GB</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}
