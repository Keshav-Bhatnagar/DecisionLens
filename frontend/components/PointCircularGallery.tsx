"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Maximize2,
  X,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Sliders,
} from "lucide-react";

export interface CategoryTheme {
  border: string;
  headerBg: string;
  badge: string;
  accent: string;
}

export type ZoomMode = "zoomOut" | "spacious" | "focus";

export interface PointCircularGalleryProps {
  categoryKey: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  colorClasses: CategoryTheme;
  items: string[];
  onUpdateItem: (index: number, newValue: string) => void;
  onDeleteItem: (index: number) => void;
  onAddItem: () => void;
  zoomLevel?: ZoomMode;
  onZoomChange?: (mode: ZoomMode) => void;
}

export default function PointCircularGallery({
  categoryKey,
  title,
  description,
  icon,
  colorClasses,
  items,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  zoomLevel: controlledZoom,
  onZoomChange,
}: PointCircularGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"circular" | "list">("circular");
  const [focusModalIndex, setFocusModalIndex] = useState<number | null>(null);

  // Internal zoom state if uncontrolled (defaults to zoomOut with clear center and semi-blurred background)
  const [internalZoom, setInternalZoom] = useState<ZoomMode>("zoomOut");
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

  const handleAddAndFocus = () => {
    onAddItem();
    setActiveIndex(items.length);
  };

  // Helper for word count and reading time
  const getReadingStats = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return { words: 0, readTimeSec: 0, lengthCategory: "Empty" };
    const words = trimmed.split(/\s+/).length;
    const readTimeSec = Math.max(1, Math.round((words / 200) * 60));
    let lengthCategory = "Brief";
    if (words > 60) lengthCategory = "Comprehensive";
    else if (words > 25) lengthCategory = "Detailed";
    return { words, readTimeSec, lengthCategory };
  };

  // Empty state when category has no points yet
  if (items.length === 0) {
    return (
      <div className="py-14 px-6 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 mx-auto flex items-center justify-center text-3xl shadow-2xs">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            No {title.toLowerCase()} recorded yet
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Add the first point to start building your verified decision context.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddAndFocus}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition shadow-2xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add First {title.slice(0, -1) || title}</span>
        </button>
      </div>
    );
  }

  // Calculate stage and card sizing based on zoomMode
  const stageHeightClass =
    zoomMode === "zoomOut"
      ? "h-[400px] sm:h-[435px]"
      : zoomMode === "focus"
      ? "h-[470px] sm:h-[510px]"
      : "h-[430px] sm:h-[460px]"; // spacious

  const cardDimensions =
    zoomMode === "zoomOut"
      ? {
          widthClass: "w-[92%] sm:w-[88%] max-w-[530px]",
          heightClass: "h-[330px] sm:h-[355px]",
          centerScale: 0.90,
          neighborScale: 0.68,
          translateX: "78%",
          translateZ: "-160px",
          perspective: "1350px",
        }
      : zoomMode === "focus"
      ? {
          widthClass: "w-[96%] sm:w-[94%] max-w-[620px]",
          heightClass: "h-[390px] sm:h-[420px]",
          centerScale: 1.03,
          neighborScale: 0.82,
          translateX: "66%",
          translateZ: "-100px",
          perspective: "1200px",
        }
      : {
          // spacious (default - bigger, roomy boxes)
          widthClass: "w-[94%] sm:w-[90%] max-w-[560px]",
          heightClass: "h-[350px] sm:h-[380px]",
          centerScale: 1.0,
          neighborScale: 0.78,
          translateX: "72%",
          translateZ: "-120px",
          perspective: "1250px",
        };

  return (
    <div className="space-y-3.5">
      {/* Sub-header: Point counter, Zoom Out / Spacious / Focus controls, and View switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span>Point {activeIndex + 1} of {items.length}</span>
          </span>
          {viewMode === "circular" && items[activeIndex] && (
            <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-2.5 py-0.5 rounded-full bg-white hidden sm:inline-block">
              {getReadingStats(items[activeIndex]).words} words
            </span>
          )}
        </div>

        {/* View mode & Zoom Out / Zoom In Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          {viewMode === "circular" && (
            <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => handleSetZoom("zoomOut")}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
                  zoomMode === "zoomOut"
                    ? "bg-white text-indigo-700 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Zoom Out: Wide angle camera perspective to view multiple cards comfortably"
              >
                <ZoomOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Zoom Out</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetZoom("spacious")}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
                  zoomMode === "spacious"
                    ? "bg-white text-indigo-700 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Spacious Box (Default): Roomy, large box with full sentence visibility"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Spacious</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetZoom("focus")}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
                  zoomMode === "focus"
                    ? "bg-white text-indigo-700 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Focus Zoom: Large reading scale for comprehensive analysis"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Focus</span>
              </button>
            </div>
          )}

          {/* 3D Gallery / List Switcher */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewMode("circular")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                viewMode === "circular"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="3D Circular Gallery View: Easy focus on one readable point at a time"
            >
              3D Gallery
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                viewMode === "list"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Stacked List View: View all points vertically"
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: 3D Circular Point Gallery with Zoomed Out / Spacious Perspective */}
      {viewMode === "circular" ? (
        <div className="relative">
          {/* 3D Stage Container */}
          <div
            className={`relative ${stageHeightClass} w-full flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50/80 via-slate-50/40 to-white border border-slate-200/90 p-4 select-none transition-all duration-300`}
            style={{ perspective: cardDimensions.perspective }}
          >
            {/* Background subtle radial ambient light */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-100/30 via-transparent to-transparent pointer-events-none" />

            {/* Circular Gallery Items */}
            {items.map((item, idx) => {
              const total = items.length;
              let diff = idx - activeIndex;
              while (diff > total / 2) diff -= total;
              while (diff < -total / 2) diff += total;

              const isCenter = diff === 0;
              const isNext = diff === 1;
              const isPrev = diff === -1;
              const isVisible = isCenter || isNext || isPrev || total === 2;

              if (!isVisible && Math.abs(diff) > 1) return null;

              // Compute 3D transformation values
              let translateX = "0%";
              let translateZ = "0px";
              let rotateY = "0deg";
              let scale = cardDimensions.centerScale;
              let opacity = 1;
              let zIndex = 30;

              if (diff === 1) {
                translateX = cardDimensions.translateX;
                translateZ = cardDimensions.translateZ;
                rotateY = "-12deg";
                scale = cardDimensions.neighborScale;
                opacity = 0.9;
                zIndex = 20;
              } else if (diff === -1) {
                translateX = `-${cardDimensions.translateX}`;
                translateZ = cardDimensions.translateZ;
                rotateY = "12deg";
                scale = cardDimensions.neighborScale;
                opacity = 0.9;
                zIndex = 20;
              }

              const stats = getReadingStats(item);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (!isCenter) setActiveIndex(idx);
                  }}
                  className={`absolute ${cardDimensions.widthClass} ${cardDimensions.heightClass} rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.18,0.85,0.25,1)] ${
                    isCenter
                      ? "cursor-default"
                      : "cursor-pointer hover:opacity-100 hover:scale-[0.82]"
                  }`}
                  style={{
                    transform: `translate3d(${translateX}, 0, ${translateZ}) scale(${scale}) rotateY(${rotateY})`,
                    zIndex,
                    opacity,
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Point Card Frame with Crisp Depth */}
                  <div
                    className={`w-full h-full rounded-2xl flex flex-col justify-between p-5 sm:p-6 transition-all duration-300 relative ${
                      isCenter
                        ? "bg-white border-2 border-indigo-200/90 shadow-2xl ring-1 ring-indigo-500/10 opacity-100"
                        : "bg-white border border-slate-200 shadow-md opacity-90 hover:opacity-100"
                    }`}
                  >

                    {/* Top Specular Lighting Edge */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none rounded-t-2xl" />

                    {/* Card Header: Point Badge, Word count & Actions */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 shrink-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 shadow-2xs ${
                            isCenter
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-200 text-slate-700 font-bold"
                          }`}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 truncate max-w-[170px]">
                          {title} #{idx + 1}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            stats.words > 50
                              ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {stats.lengthCategory}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isCenter && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusModalIndex(idx);
                            }}
                            title="Open large reading focus mode"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem(idx);
                          }}
                          title="Delete point"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Point Body: High-Legibility Typography Area with Zero Scrollbar Clutter */}
                    <div className="flex-1 py-3 overflow-y-auto scrollbar-none">
                      {isCenter ? (
                        <textarea
                          value={item}
                          onChange={(e) => onUpdateItem(idx, e.target.value)}
                          placeholder={`Describe this ${title.toLowerCase().slice(0, -1)} in detail...`}
                          className="w-full h-full text-[15px] sm:text-[15.5px] leading-[1.7] text-slate-900 placeholder:text-slate-400 bg-transparent border-0 focus:ring-0 p-0 focus:outline-none resize-none font-normal scrollbar-none"
                        />
                      ) : (
                        <p className="text-sm text-slate-700 font-medium line-clamp-6 leading-relaxed select-none">
                          {item || `Empty ${title.toLowerCase()} point...`}
                        </p>
                      )}
                    </div>


                    {/* Card Footer: Reading Metrics & Helpful Hint */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                      <span>
                        {stats.words} words • ~{stats.readTimeSec}s read
                      </span>
                      {isCenter && (
                        <span className="text-indigo-600 font-medium text-[11px]">
                          Editable in-place
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Left and Right Floating 3D Navigation Arrows */}
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-40 p-2.5 rounded-full bg-white/95 text-slate-700 hover:text-indigo-600 hover:bg-white shadow-md border border-slate-200/80 transition-all hover:scale-110 active:scale-95"
                  title="Previous Point"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-40 p-2.5 rounded-full bg-white/95 text-slate-700 hover:text-indigo-600 hover:bg-white shadow-md border border-slate-200/80 transition-all hover:scale-110 active:scale-95"
                  title="Next Point"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Dot Navigator & Add Button */}
          <div className="flex items-center justify-between gap-3 pt-2.5">
            {/* Direct-Jump Dot Carousel */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {items.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  onClick={() => setActiveIndex(dotIdx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    dotIdx === activeIndex
                      ? "w-6 bg-indigo-600"
                      : "w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                  title={`Go to point ${dotIdx + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddAndFocus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-xl transition border border-transparent hover:border-indigo-100"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Point</span>
            </button>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: Stacked List View */
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs hover:border-slate-300 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  #{idx + 1} {title.slice(0, -1) || title}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteItem(idx)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                  title="Delete point"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <textarea
                value={item}
                rows={4}
                onChange={(e) => onUpdateItem(idx, e.target.value)}
                placeholder={`Describe this ${title.toLowerCase().slice(0, -1)}...`}
                className="w-full text-sm leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddAndFocus}
            className="w-full py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-dashed border-slate-300 rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Another Point</span>
          </button>
        </div>
      )}

      {/* Large Reading Focus Modal for Extra-Lengthy Points */}
      {focusModalIndex !== null && items[focusModalIndex] !== undefined && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-slate-700">
                  {icon}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {title} — Point #{focusModalIndex + 1}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Full Focus Reading &amp; Editing
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFocusModalIndex(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Generous Reading Font */}
            <div className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Reading Stats
                </span>
                <span>
                  {getReadingStats(items[focusModalIndex]).words} words • ~
                  {getReadingStats(items[focusModalIndex]).readTimeSec} sec read
                </span>
              </div>

              <textarea
                rows={10}
                value={items[focusModalIndex]}
                onChange={(e) => onUpdateItem(focusModalIndex, e.target.value)}
                placeholder="Write the full comprehensive point detail here..."
                className="w-full text-base leading-relaxed text-slate-900 bg-white border border-slate-200 rounded-2xl p-5 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y font-normal shadow-2xs"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onDeleteItem(focusModalIndex);
                  setFocusModalIndex(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Point</span>
              </button>

              <button
                type="button"
                onClick={() => setFocusModalIndex(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
              >
                Done Reading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
