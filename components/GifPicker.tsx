"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "GlVGYHqc3SyCEGnmO0locp30Xpba4tJi";

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [gifs, setGifs] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const endpoint = searchQuery
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error("Failed to fetch GIFs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch for trending GIFs
    fetchGifs("");
  }, [fetchGifs]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchGifs(query);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [query, fetchGifs]);

  return (
    <div className="absolute bottom-full mb-2 right-0 w-80 max-w-[calc(100vw-2rem)] border border-[#ff3434] bg-[#090909] shadow-[0_0_30px_rgba(255,52,52,0.15)] z-50 animate-slide-up">
      <div className="flex items-center justify-between border-b border-[#3b1111] p-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff3434]">
          GIF_Selection
        </span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-[#ff3434] transition-colors"
        >
          ✕
        </button>
      </div>
      
      <div className="p-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIPHY..."
          className="w-full border border-[#3b1111] bg-black px-3 py-2 font-mono text-xs text-white placeholder-zinc-600 focus:border-[#ff3434] focus:outline-none"
        />
      </div>

      <div className="h-64 overflow-y-auto p-3 pt-0">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-4 animate-spin border-2 border-[#ff3434] border-t-transparent rounded-full" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">
            No GIFs found.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.images.fixed_height.url)}
                className="group relative aspect-video overflow-hidden border border-[#3b1111] bg-black hover:border-[#ff3434] transition-colors"
              >
                <Image
                  src={gif.images.fixed_height_small.url}
                  alt={gif.title}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="border-t border-[#3b1111] p-2 text-center">
        <Image
          src="/Poweredby_100px-Black_VertLogo.png"
          alt="Powered by Giphy"
          width={100}
          height={35}
          className="mx-auto opacity-50"
          unoptimized
        />
      </div>
    </div>
  );
}
