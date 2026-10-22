"use client";

import React, { useState } from "react";
import PlaygroundView from "@/components/PlaygroundView";
import DocsView, { DOC_SECTIONS } from "@/components/DocsView";
import ArchitectureView from "@/components/ArchitectureView";
import BenchmarksView from "@/components/BenchmarksView";
import ScrollIsland, { IndexItem } from "@/components/ScrollIsland";
import styles from "./page.module.css";

type TabView = "playground" | "docs" | "architecture" | "benchmarks";

const SECTIONS_MAP: Record<TabView, IndexItem[]> = {
  docs: DOC_SECTIONS,
  architecture: [
    { id: "sec-pipeline", title: "Compilation Pipeline" },
    { id: "sec-opcodes-table", title: "37 Opcode Directory" },
  ],
  playground: [
    { id: "sec-playground-top", title: "Virtual Machine Playground" },
  ],
  benchmarks: [
    { id: "sec-bench-controls", title: "Live Hardware Benchmarks" },
    { id: "sec-bench-comparison", title: "Isolation & Overhead Matrix" },
  ],
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabView>("docs");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [playgroundCode, setPlaygroundCode] = useState<string | undefined>(undefined);
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-quickstart");

  const handleCopyInstall = () => {
    navigator.clipboard.writeText("npm install @hypecaves/compiler");
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleRunInPlayground = (code: string) => {
    setPlaygroundCode(code);
    setActiveTab("playground");
  };

  return (
    <div className={styles.pageWrapper}>
      {/* Dynamic Floating Island with Progress Ring, Index Dropdown, and Top Fade */}
      <ScrollIsland
        sections={SECTIONS_MAP[activeTab] || []}
        activeId={activeSectionId}
        threshold={65}
      />

      {/* Top Navigation Bar with Interactive Navlinks */}
      <header className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("docs");
            }}
            className={styles.brandLink}
          >
            <span>Fradual</span>
            <span className={styles.brandBadge}>v2.0.0</span>
          </a>
        </div>

        {/* Center Navlinks */}
        <nav className={styles.navLinks} aria-label="Main Navigation">
          <button
            type="button"
            className={`${styles.navBtn} ${activeTab === "docs" ? styles.navBtnActive : ""}`}
            onClick={() => {
              setActiveTab("docs");
              setActiveSectionId("sec-quickstart");
            }}
          >
            Documentation
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${activeTab === "playground" ? styles.navBtnActive : ""}`}
            onClick={() => setActiveTab("playground")}
          >
            Playground
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${activeTab === "architecture" ? styles.navBtnActive : ""}`}
            onClick={() => {
              setActiveTab("architecture");
              setActiveSectionId("sec-pipeline");
            }}
          >
            Architecture
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${activeTab === "benchmarks" ? styles.navBtnActive : ""}`}
            onClick={() => {
              setActiveTab("benchmarks");
              setActiveSectionId("sec-bench-controls");
            }}
          >
            Benchmarks
          </button>
        </nav>

        {/* Right Actions */}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.installPill}
            onClick={handleCopyInstall}
            title="Click to copy install command"
          >
            {copiedInstall ? (
              <>
                <svg className={styles.copyCheckIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <span>npm i @hypecaves/compiler</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </>
            )}
          </button>

          <a
            href="https://github.com/hypecavess/compiler"
            target="_blank"
            rel="noreferrer"
            className={styles.githubBtn}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </header>

      {/* Main Tabbed Views */}
      <main className={styles.mainContainer}>
        {activeTab === "docs" && (
          <DocsView
            onRunInPlayground={handleRunInPlayground}
            onActiveSectionChange={setActiveSectionId}
          />
        )}
        {activeTab === "playground" && <PlaygroundView initialCode={playgroundCode} />}
        {activeTab === "architecture" && <ArchitectureView />}
        {activeTab === "benchmarks" && <BenchmarksView />}
      </main>
    </div>
  );
}
