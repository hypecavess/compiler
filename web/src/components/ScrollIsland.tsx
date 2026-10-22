"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./ScrollIsland.module.css";

export interface IndexItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface ScrollIslandProps {
  sections: IndexItem[];
  activeId?: string;
  threshold?: number;
  onNavigate?: (id: string) => void;
}

export default function ScrollIsland({
  sections,
  activeId,
  threshold = 80,
  onNavigate,
}: ScrollIslandProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Compute scroll progress and visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      
      if (scrollY > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
        setIsIndexOpen(false);
      }

      if (scrollHeight > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((scrollY / scrollHeight) * 100)));
        setScrollProgress(pct);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsIndexOpen(false);
      }
    };
    if (isIndexOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isIndexOpen]);

  const handleScrollToSection = (id: string) => {
    setIsIndexOpen(false);
    if (onNavigate) {
      onNavigate(id);
    } else {
      const el = document.getElementById(id);
      if (el) {
        const headerOffset = 90;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }
  };

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // SVG Ring calculation: Radius 8.5 => Circumference = 2 * PI * 8.5 ~= 53.407
  const ringRadius = 8.5;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference - (scrollProgress / 100) * circumference;

  return (
    <>
      {/* Top Gradient Fade Mask */}
      <div
        className={`${styles.topFadeMask} ${isVisible ? styles.topFadeMaskVisible : ""}`}
        aria-hidden="true"
      />

      {/* Floating Dynamic Island Capsule */}
      <div
        ref={dropdownRef}
        className={`${styles.islandWrapper} ${isVisible ? styles.islandWrapperVisible : ""}`}
      >
        <div className={styles.islandPill}>
          {/* Progress Ring with Smooth SVG animation */}
          <button
            type="button"
            className={styles.ringBtn}
            onClick={handleScrollTop}
            title="Scroll to top"
            aria-label="Scroll to top"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" className={styles.ringSvg}>
              {/* Inactive Track */}
              <circle
                cx="12"
                cy="12"
                r={ringRadius}
                stroke="#374151"
                strokeWidth="2.4"
                fill="none"
              />
              {/* Dynamic Active Stroke */}
              <circle
                cx="12"
                cy="12"
                r={ringRadius}
                stroke="#ffffff"
                strokeWidth="2.4"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 12 12)"
                style={{ transition: "stroke-dashoffset 0.15s ease-out" }}
              />
            </svg>
          </button>

          {/* Index Dropdown Button */}
          <button
            type="button"
            className={styles.indexTrigger}
            onClick={() => setIsIndexOpen((prev) => !prev)}
            aria-expanded={isIndexOpen}
            aria-label="Table of Contents index"
          >
            <span className={styles.indexLabel}>Index</span>
            <svg
              className={`${styles.chevronIcon} ${isIndexOpen ? styles.chevronRotated : ""}`}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Percentage Pill */}
          <button
            type="button"
            className={styles.percentBadge}
            onClick={handleScrollTop}
            title="Reading Progress (Click to scroll top)"
          >
            {scrollProgress}%
          </button>
        </div>

        {/* Refined Minimalist Index Menu */}
        {isIndexOpen && (
          <div className={styles.dropdownPopover} role="menu">
            <div className={styles.dropdownList}>
              {sections.map((sec, idx) => {
                const isActive = activeId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    role="menuitem"
                    className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ""}`}
                    onClick={() => handleScrollToSection(sec.id)}
                  >
                    <span className={styles.itemIndex}>{String(idx + 1).padStart(2, "0")}</span>
                    <span className={styles.itemTitle}>{sec.title}</span>
                    {isActive && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.checkIcon}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
