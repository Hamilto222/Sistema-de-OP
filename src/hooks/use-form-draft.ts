"use client";
import { useEffect, useState } from "react";
const PREFIX = "op-digital-draft:";
// Temporary recovery only. No files, credentials or signed URLs are persisted.
export function useFormDraft(key: string, initial: Record<string, string>) {
  const [values, setValues] = useState(initial);
  const [recovery, setRecovery] = useState<Record<string, string> | null>(null);
  const [dirty, setDirty] = useState(false);
  const storageKey = PREFIX + key;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved && Date.now() - saved.at < 86400000 && saved.values && Object.keys(initial).every(field => typeof saved.values[field] === "string") && Object.values(saved.values).every(value => typeof value === "string" && value.length <= 4000)) queueMicrotask(() => setRecovery(saved.values));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Recovery is optional when browser storage is unavailable. */ }
    // initial is the immutable server snapshot for this mounted form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(field: string, value: string) {
    const next = { ...values, [field]: value }; setValues(next); setDirty(true);
    try { sessionStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), values: next })); } catch { /* The official record remains PostgreSQL. */ }
  }
  function clear() { try { sessionStorage.removeItem(storageKey); } catch {} setRecovery(null); setDirty(false); }
  function restore() { if (recovery) { setValues(recovery); setDirty(true); setRecovery(null); } }
  return { values, update, recovery, restore, clear, markDirty: () => setDirty(true) };
}
export function clearFormDrafts() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key); } catch {}
}
