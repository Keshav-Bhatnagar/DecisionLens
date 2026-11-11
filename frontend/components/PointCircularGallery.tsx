"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Trash2, Maximize2 } from "lucide-react";

export interface CategoryTheme {
  border: string;
  badge: string;
  accent: string;
}

export type ZoomMode = "zoomOut" | "spacious" | "focus";

export interface PointCircularGalleryProps {
  categoryKey: string;
  title: string;
  description: string;
  colorClasses: CategoryTheme;
  items: string[];
  onUpdateItem: (index: number, newValue: string) => void;
  onDeleteItem: (index: number) => void;
  onAddItem: () => void;
  zoomLevel?: ZoomMode;
  onZoomChange?: (mode: ZoomMode) => void;
  whyClassified?: string;
  getItemWhyClassified?: (index: number, text: string) => string;
  downstreamDestination?: string;
}

export default function PointCircularGallery({
  categoryKey,
  title,
  description,
  colorClasses,
  items,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  zoomLevel: controlledZoom,
  onZoomChange,
  whyClassified,
  getItemWhyClassified,
  downstreamDestination,
}: PointCircularGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"circular" | "list">("circular");
  const [focusModalIndex, setFocusModalIndex] = useState<number | null>(null);

  // Internal zoom state if uncontrolled (defaults to spacious for immediate clarity)
  const [internalZoom, setInternalZoom] = useState<ZoomMode>("spacious");
  const zoomMode = controlledZoom !== undefined ? controlledZoom : internalZoom;

  const handleSetZoom = (mode: ZoomMode) => {
    if (onZoomChange) {
      onZoomChange(mode);
    } else {
      setInternalZoom(mode);
    }
  };

  // Keep active index within valid bounds when items change
  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= items.length) {
      setActiveIndex(items.length - 1);
    }
  }, [items.length, activeIndex]);

  const handlePrev = () => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % items.length);
  };

  // Keyboard navigation inside the 3D circular carousel (ArrowLeft / ArrowRight)
  useEffect(() => {
    if (viewMode !== "circular") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, items.length]);

  // Pointer drag gestures for tactile circular rotation
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) return;
    setDragStartX(e.clientX);
    setIsDragging(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || dragStartX === null) return;
    const diffX = e.clientX - dragStartX;
    if (diffX > 40) {
      handlePrev();
    } else if (diffX < -40) {
      handleNext();
    }
    setDragStartX(null);
    setIsDragging(false);
  };

  const handleAddAndFocus = () => {
    onAddItem();
    setActiveIndex(items.length);
  };

  // Humanized reading stats
  const getReadingStats = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return { words: 0, readTimeText: "Empty" };
    const words = trimmed.split(/\s+/).length;
    const readTimeSec = Math.max(1, Math.round((words / 200) * 60));
    return {
      words,
      readTimeText: `~${readTimeSec}s read`,
    };
  };

  // Empty state when category has no points yet
  if (items.length === 0) {
    return (
      <div className="py-12 px-6 text-center bg-[#FDFCF8] dark:bg-[#1A1815] rounded-xl border border-dashed border-[#D9D2C3] dark:border-[#38332C] space-y-3 font-sans">
        <h4 className="text-sm font-bold text-[#161E33] dark:text-[#F0EAE1]">
          No {title.toLowerCase()} recorded yet
        </h4>
        <p className="text-xs text-[#5A6275] dark:text-[#A89F91] max-w-sm mx-auto leading-relaxed">
          Add an initial point to ground this section of your decision context.
        </p>
        <button
          type="button"
          onClick={handleAddAndFocus}
          className="inline-flex items-center px-4 py-2 text-xs font-bold text-[#161E33] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] hover:bg-[#E5DEC9] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
        >
          Add {title.slice(0, -1) || title}
        </button>
      </div>
    );
  }

  // Stage and card sizing based on zoomMode
  const stageHeightClass =
    zoomMode === "zoomOut"
      ? "h-[450px] sm:h-[480px]"
      : zoomMode === "focus"
      ? "h-[510px] sm:h-[550px]"
      : "h-[470px] sm:h-[500px]";

  const cardDimensions =
    zoomMode === "zoomOut"
      ? {
          widthClass: "w-[90%] sm:w-[84%] max-w-[500px]",
          heightClass: "h-[360px] sm:h-[390px]",
          neighborScale: 0.76,
          translateX: "70%",
          translateZ: "-130px",
          perspective: "1350px",
        }
      : zoomMode === "focus"
      ? {
          widthClass: "w-[96%] sm:w-[94%] max-w-[620px]",
          heightClass: "h-[420px] sm:h-[450px]",
          neighborScale: 0.82,
          translateX: "66%",
          translateZ: "-100px",
          perspective: "1200px",
        }
      : {
          widthClass: "w-[94%] sm:w-[88%] max-w-[550px]",
          heightClass: "h-[380px] sm:h-[410px]",
          neighborScale: 0.8,
          translateX: "70%",
          translateZ: "-120px",
          perspective: "1250px",
        };

  return (
    <div className="space-y-3 font-sans">
      {/* Sub-header: Point counter, zoom mode & view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#5A6275] dark:text-[#A89F91]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#161E33] dark:text-[#F0EAE1]">
            Item {activeIndex + 1} of {items.length}
          </span>
          {viewMode === "circular" && items[activeIndex] && (
            <span className="text-[11px] font-mono text-[#5A6275] dark:text-[#A89F91] border border-[#D9D2C3] dark:border-[#38332C] px-2 py-0.5 rounded-md bg-[#FCFBF8] dark:bg-[#1E1B18] hidden sm:inline-block">
              {getReadingStats(items[activeIndex]).readTimeText}
            </span>
          )}
        </div>

        {/* View mode & Zoom controls */}
        <div className="flex items-center gap-2">
          {viewMode === "circular" && (
            <div className="flex items-center bg-[#EDE7D6] dark:bg-[#221F1C] p-0.5 rounded-lg border border-[#cfc7b2] dark:border-[#38332C] text-[11px]">
              <button
                type="button"
                onClick={() => handleSetZoom("zoomOut")}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  zoomMode === "zoomOut"
                    ? "bg-[#FCFBF8] dark:bg-[#2E2924] text-[#161E33] dark:text-[#D4AA50] font-bold shadow-2xs"
                    : "text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1]"
                }`}
                title="Wide angle: see surrounding cards in the 3D arc"
              >
                Wide
              </button>
              <button
                type="button"
                onClick={() => handleSetZoom("spacious")}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  zoomMode === "spacious"
                    ? "bg-[#FCFBF8] dark:bg-[#2E2924] text-[#161E33] dark:text-[#D4AA50] font-bold shadow-2xs"
                    : "text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1]"
                }`}
                title="Spacious: balanced view for reading and in-place editing"
              >
                Spacious
              </button>
              <button
                type="button"
                onClick={() => handleSetZoom("focus")}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  zoomMode === "focus"
                    ? "bg-[#FCFBF8] dark:bg-[#2E2924] text-[#161E33] dark:text-[#D4AA50] font-bold shadow-2xs"
                    : "text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1]"
                }`}
                title="Focus: maximum card scale"
              >
                Focus
              </button>
            </div>
          )}

          <div className="flex items-center bg-[#EDE7D6] dark:bg-[#221F1C] p-0.5 rounded-lg border border-[#cfc7b2] dark:border-[#38332C] text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("circular")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === "circular"
                  ? "bg-[#FCFBF8] dark:bg-[#2E2924] text-[#161E33] dark:text-[#D4AA50] font-bold shadow-2xs"
                  : "text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Orbit
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-[#FCFBF8] dark:bg-[#2E2924] text-[#161E33] dark:text-[#D4AA50] font-bold shadow-2xs"
                  : "text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1]"
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: 3D Orbit Carousel */}
      {viewMode === "circular" ? (
        <div className="relative">
          {/* Stage */}
          <div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`relative ${stageHeightClass} w-full flex items-center justify-center overflow-hidden rounded-xl bg-[#F5F1E8] dark:bg-[#1C1A17] border border-[#D9D2C3] dark:border-[#38332C] p-4 select-none transition-all duration-300 cursor-grab active:cursor-grabbing`}
            style={{ perspective: cardDimensions.perspective }}
          >
            {/* Subtle warm ambient reflection */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#B4874B]/8 dark:from-[#D4AA50]/5 via-transparent to-transparent pointer-events-none" />

            {/* Orbit Cards */}
            {items.map((item, idx) => {
              const total = items.length;
              let diff = idx - activeIndex;
              while (diff > total / 2) diff -= total;
              while (diff < -total / 2) diff += total;

              const isCenter = diff === 0;
              const isNext1 = diff === 1;
              const isNext2 = diff === 2;
              const isPrev1 = diff === -1;
              const isPrev2 = diff === -2;
              const isVisible =
                isCenter || isNext1 || isNext2 || isPrev1 || isPrev2 || total <= 5;

              if (!isVisible && Math.abs(diff) > 2) return null;

              let translateX = "0%";
              let translateZ = "0px";
              let rotateY = "0deg";
              let scale = 1;
              let opacity = 1;
              let zIndex = 40;

              if (diff === 1) {
                translateX = cardDimensions.translateX;
                translateZ = cardDimensions.translateZ;
                rotateY = "-16deg";
                scale = cardDimensions.neighborScale;
                opacity = 0.88;
                zIndex = 30;
              } else if (diff === -1) {
                translateX = `-${cardDimensions.translateX}`;
                translateZ = cardDimensions.translateZ;
                rotateY = "16deg";
                scale = cardDimensions.neighborScale;
                opacity = 0.88;
                zIndex = 30;
              } else if (diff === 2) {
                translateX = "112%";
                translateZ = "-240px";
                rotateY = "-28deg";
                scale = 0.65;
                opacity = 0.45;
                zIndex = 20;
              } else if (diff === -2) {
                translateX = "-112%";
                translateZ = "-240px";
                rotateY = "28deg";
                scale = 0.65;
                opacity = 0.45;
                zIndex = 20;
              }

              const stats = getReadingStats(item);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (!isCenter) setActiveIndex(idx);
                  }}
                  className={`absolute ${cardDimensions.widthClass} ${cardDimensions.heightClass} rounded-xl transition-all duration-500 ease-[cubic-bezier(0.18,0.85,0.25,1)] ${
                    isCenter
                      ? "cursor-default"
                      : "cursor-pointer hover:opacity-100 hover:scale-[0.82]"
                  }`}
                  style={{
                    transform: isCenter
                      ? "none"
                      : `translate3d(${translateX}, 0, ${translateZ}) scale(${scale}) rotateY(${rotateY})`,
                    zIndex,
                    opacity,
                    transformStyle: isCenter ? "flat" : "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitFontSmoothing: "subpixel-antialiased",
                  }}
                >
                  {/* Card Frame */}
                  <div
                    style={{ transform: "none", backfaceVisibility: "hidden" }}
                    className={`w-full h-full rounded-xl flex flex-col justify-between p-5 sm:p-6 transition-all duration-300 relative ${
                      isCenter
                        ? "bg-[#F4F0E6] dark:bg-[#221F1C] border-2 border-[#7a4e10] dark:border-[#D4AA50] shadow-md opacity-100"
                        : "bg-[#EDE7D6] dark:bg-[#1E1B18] border border-[#cfc7b2] dark:border-[#38332C] opacity-85 hover:opacity-100"
                    }`}
                  >
                    {/* Header: Number, title & subtle actions */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#D9D2C3]/60 dark:border-[#38332C] shrink-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-md text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                            isCenter
                              ? "bg-[#161E33] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614]"
                              : "bg-[#D9D2C3] dark:bg-[#2E2924] text-[#161E33] dark:text-[#F0EAE1]"
                          }`}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="font-newsreader text-base font-normal text-[#1d1d1b] dark:text-[#F0EAE1] truncate max-w-[200px]">
                          {title} #{idx + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {isCenter && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusModalIndex(idx);
                            }}
                            className="text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1] hover:underline cursor-pointer"
                          >
                            Expand
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem(idx);
                          }}
                          className="text-[#5A6275] dark:text-[#A89F91] hover:text-red-700 dark:hover:text-red-400 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Epistemic Rationale on Active Card */}
                    {isCenter && (getItemWhyClassified ? getItemWhyClassified(idx, item) : whyClassified) && (
                      <div className="mt-2.5 mb-1 px-3 py-2 bg-[#F5F1E8] dark:bg-[#1A1815] rounded-lg border border-[#D9D2C3]/70 dark:border-[#38332C] text-[11px] leading-relaxed text-[#5A6275] dark:text-[#A89F91] shrink-0 font-sans">
                        <span className="font-bold font-mono text-[10px] text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                          Why {title}?
                        </span>
                        <span>{getItemWhyClassified ? getItemWhyClassified(idx, item) : whyClassified}</span>
                      </div>
                    )}

                    {/* Text Body */}
                    <div className="flex-1 py-3 overflow-y-auto scrollbar-none">
                      {isCenter ? (
                        <textarea
                          value={item}
                          onChange={(e) => onUpdateItem(idx, e.target.value)}
                          placeholder={`Describe this ${title.toLowerCase().slice(0, -1)} in detail...`}
                          className="w-full h-full text-base sm:text-base leading-[1.7] text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#8B909C] bg-transparent border-0 focus:ring-0 p-0 focus:outline-none resize-none font-newsreader font-normal scrollbar-none subpixel-antialiased select-text"
                        />
                      ) : (
                        <p className="text-base font-newsreader text-[#4f4b40] dark:text-[#A89F91] line-clamp-6 leading-relaxed select-none">
                          {item || `Empty ${title.toLowerCase()} point...`}
                        </p>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="pt-2.5 border-t border-[#D9D2C3]/60 dark:border-[#38332C] flex items-center justify-between text-[11px] text-[#5A6275] dark:text-[#A89F91] shrink-0 font-mono">
                      <span>
                        {stats.words} words • {stats.readTimeText}
                      </span>
                      {isCenter ? (
                        <span className="text-[#7a4e10] dark:text-[#D4AA50] font-sans font-medium">
                          Click to edit
                        </span>
                      ) : (
                        <span className="text-[#8B909C] font-sans">
                          Click to rotate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Stepper Chevrons */}
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-50 w-9 h-9 rounded-full bg-[#FCFBF8]/95 dark:bg-[#221F1C]/95 text-[#161E33] dark:text-[#F0EAE1] hover:text-[#7a4e10] dark:hover:text-[#D4AA50] shadow-sm border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  title="Previous item (or press ← Arrow)"
                  aria-label="Previous item"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-50 w-9 h-9 rounded-full bg-[#FCFBF8]/95 dark:bg-[#221F1C]/95 text-[#161E33] dark:text-[#F0EAE1] hover:text-[#7a4e10] dark:hover:text-[#D4AA50] shadow-sm border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  title="Next item (or press → Arrow)"
                  aria-label="Next item"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Dot Navigator & Add Action */}
          <div className="flex items-center justify-between gap-3 pt-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {items.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  onClick={() => setActiveIndex(dotIdx)}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    dotIdx === activeIndex
                      ? "w-6 bg-[#7a4e10] dark:bg-[#D4AA50]"
                      : "w-2 bg-[#D9D2C3] dark:bg-[#38332C] hover:bg-[#B4874B]"
                  }`}
                  title={`Go to item ${dotIdx + 1}`}
                  aria-label={`Go to item ${dotIdx + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#5A6275] dark:text-[#A89F91] hidden sm:inline">
                Drag stage or press ← / →
              </span>
              <button
                type="button"
                onClick={handleAddAndFocus}
                className="px-3 py-1.5 text-xs font-bold text-[#161E33] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] hover:bg-[#E5DEC9] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
              >
                + Add Point
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 2: Clean List */
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="p-4 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-xl space-y-2.5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#161E33] dark:text-[#F0EAE1]">
                  #{idx + 1} {title.slice(0, -1) || title}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteItem(idx)}
                  className="text-xs text-[#5A6275] dark:text-[#A89F91] hover:text-red-700 dark:hover:text-red-400 hover:underline cursor-pointer"
                >
                  Delete
                </button>
              </div>

              <textarea
                value={item}
                rows={3}
                onChange={(e) => onUpdateItem(idx, e.target.value)}
                placeholder={`Describe this ${title.toLowerCase().slice(0, -1)}...`}
                className="w-full text-sm leading-relaxed text-[#161E33] dark:text-[#F0EAE1] bg-[#F5F1E8] dark:bg-[#1A1815] border border-[#D9D2C3] dark:border-[#38332C] rounded-lg p-3 focus:ring-1 focus:ring-[#7a4e10] dark:focus:ring-[#D4AA50] focus:outline-none resize-y font-sans font-normal"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddAndFocus}
            className="w-full py-2.5 text-xs font-bold text-[#161E33] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] hover:bg-[#E5DEC9] dark:hover:bg-[#2C2723] border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
          >
            + Add Another Point
          </button>
        </div>
      )}

      {/* Focus Modal */}
      {focusModalIndex !== null && items[focusModalIndex] !== undefined && (
        <div className="fixed inset-0 z-50 bg-[#161E33]/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FCFBF8] dark:bg-[#221F1C] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-[#D9D2C3] dark:border-[#38332C] overflow-hidden font-sans">
            <div className="px-6 py-4 border-b border-[#D9D2C3] dark:border-[#38332C] flex items-center justify-between bg-[#EDE7D6] dark:bg-[#1A1815]">
              <div>
                <h3 className="text-base font-bold text-[#161E33] dark:text-[#F0EAE1]">
                  {title} — Point #{focusModalIndex + 1}
                </h3>
                <p className="text-xs text-[#5A6275] dark:text-[#A89F91]">
                  Expanded reading &amp; editing
                </p>
                {(getItemWhyClassified ? getItemWhyClassified(focusModalIndex, items[focusModalIndex] || "") : whyClassified) && (
                  <p className="text-xs text-[#7a4e10] dark:text-[#D4AA50] mt-1 font-mono">
                    Why {title}: {getItemWhyClassified ? getItemWhyClassified(focusModalIndex, items[focusModalIndex] || "") : whyClassified}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFocusModalIndex(null)}
                className="p-1.5 text-[#5A6275] dark:text-[#A89F91] hover:text-[#161E33] dark:hover:text-[#F0EAE1] rounded-lg transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-4">
              <textarea
                rows={10}
                value={items[focusModalIndex]}
                onChange={(e) => onUpdateItem(focusModalIndex, e.target.value)}
                placeholder="Write the full detail here..."
                className="w-full text-base leading-relaxed text-[#161E33] dark:text-[#F0EAE1] bg-[#F5F1E8] dark:bg-[#1A1815] border border-[#D9D2C3] dark:border-[#38332C] rounded-xl p-4 focus:ring-1 focus:ring-[#7a4e10] dark:focus:ring-[#D4AA50] focus:outline-none resize-y font-sans font-normal"
              />
            </div>

            <div className="px-6 py-4 bg-[#EDE7D6] dark:bg-[#1A1815] border-t border-[#D9D2C3] dark:border-[#38332C] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onDeleteItem(focusModalIndex);
                  setFocusModalIndex(null);
                }}
                className="text-xs font-bold text-red-700 dark:text-red-400 hover:underline cursor-pointer"
              >
                Delete Point
              </button>

              <button
                type="button"
                onClick={() => setFocusModalIndex(null)}
                className="px-4 py-2 text-xs font-bold text-[#F5F1E8] bg-[#161E33] hover:bg-[#232C47] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-lg transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
