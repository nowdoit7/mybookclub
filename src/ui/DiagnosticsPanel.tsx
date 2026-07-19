import { useState, useSyncExternalStore } from "react";

import {
  clearGenerationDiagnostics,
  formatGenerationDiagnostics,
  getGenerationDiagnostics,
  subscribeToGenerationDiagnostics,
} from "../api/diagnostics";
import { describeRoomAtmosphere } from "../engine/roomAtmosphere";
import type { AppLanguage, RoomAtmosphere } from "../types";

const COPY = {
  en: {
    button: "Diagnostics",
    title: "API diagnostics",
    description: "Development metadata only. No prompts, messages, notes, or API keys are recorded.",
    empty: "No live API requests recorded yet.",
    copy: "Copy diagnostics",
    copied: "Copied",
    clear: "Clear",
    close: "Close",
    request: "App request",
    upstream: "OpenAI request",
    pending: "IN PROGRESS",
    atmosphere: "Current room atmosphere",
    warmth: "Warmth",
    playfulness: "Playfulness",
    tension: "Tension",
    energy: "Energy",
  },
  ko: {
    button: "진단 정보",
    title: "API 진단 정보",
    description: "개발용 메타데이터만 표시합니다. 프롬프트, 대화, 독서 노트, API 키는 기록하지 않습니다.",
    empty: "아직 실제 API 요청 기록이 없습니다.",
    copy: "진단 정보 복사",
    copied: "복사됨",
    clear: "비우기",
    close: "닫기",
    request: "앱 요청",
    upstream: "OpenAI 요청",
    pending: "진행 중",
    atmosphere: "현재 소모임 분위기",
    warmth: "따뜻함",
    playfulness: "유쾌함",
    tension: "긴장감",
    energy: "활기",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

export function DiagnosticsPanel({
  language,
  roomAtmosphere,
}: {
  language: AppLanguage;
  roomAtmosphere?: RoomAtmosphere;
}) {
  const diagnostics = useSyncExternalStore(
    subscribeToGenerationDiagnostics,
    getGenerationDiagnostics,
    getGenerationDiagnostics,
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = COPY[language];

  if (!import.meta.env.DEV || import.meta.env.MODE === "test") return null;

  const handleCopy = async () => {
    try {
      await copyText(formatGenerationDiagnostics());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-1 right-1 z-[60] rounded-full border border-stone-300 bg-white/90 px-2 py-1 text-[10px] font-semibold text-stone-700 shadow-lg backdrop-blur hover:bg-white"
      >
        {copy.button}
        {roomAtmosphere ? ` · ${describeRoomAtmosphere(roomAtmosphere, language)}` : ""}
        {diagnostics.length > 0 ? ` · ${diagnostics.length}` : ""}
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[60] flex max-h-[75vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-2xl">
      <div className="border-b border-stone-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-stone-900">{copy.title}</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">{copy.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 text-xs font-semibold text-stone-500 hover:text-stone-900"
          >
            {copy.close}
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-700"
          >
            {copied ? copy.copied : copy.copy}
          </button>
          <button
            type="button"
            onClick={clearGenerationDiagnostics}
            disabled={diagnostics.length === 0}
            className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-600 disabled:opacity-40"
          >
            {copy.clear}
          </button>
        </div>
        {roomAtmosphere && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
              {copy.atmosphere}
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-950">
              {describeRoomAtmosphere(roomAtmosphere, language)}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-amber-900/75">
              {(
                ["warmth", "playfulness", "tension", "energy"] as const
              ).map((key) => (
                <div key={key} className="flex justify-between gap-2">
                  <dt>{copy[key]}</dt>
                  <dd className="font-mono">{Math.round(roomAtmosphere[key] * 100)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="overflow-y-auto p-3">
        {diagnostics.length === 0 ? (
          <p className="p-3 text-sm text-stone-500">{copy.empty}</p>
        ) : (
          <ol className="space-y-2">
            {diagnostics.map((diagnostic) => (
              <li
                key={diagnostic.id}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`font-bold ${
                      diagnostic.outcome === "success"
                        ? "text-emerald-700"
                        : diagnostic.outcome === "pending"
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {diagnostic.outcome === "pending"
                      ? copy.pending
                      : `${diagnostic.outcome.toUpperCase()} · HTTP ${diagnostic.status || "NETWORK"}`}
                  </span>
                  <span className="text-stone-400">
                    {diagnostic.outcome === "pending" ? "…" : `${diagnostic.durationMs} ms`}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-stone-700">{diagnostic.endpoint}</p>
                {diagnostic.code && (
                  <p className="mt-1 font-mono text-[11px] font-semibold text-red-700">
                    {diagnostic.code}
                  </p>
                )}
                {diagnostic.detail && (
                  <p className="mt-1 leading-5 text-stone-600">{diagnostic.detail}</p>
                )}
                {diagnostic.requestId && (
                  <p className="mt-1 break-all text-[10px] text-stone-400">
                    {copy.request}: {diagnostic.requestId}
                  </p>
                )}
                {diagnostic.upstreamRequestId && (
                  <p className="mt-1 break-all text-[10px] text-stone-400">
                    {copy.upstream}: {diagnostic.upstreamRequestId}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
