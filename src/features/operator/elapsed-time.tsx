"use client";
import { useEffect, useState } from "react";
export function ElapsedTime({ start, end, serverNow }: { start: string | null; end: string | null; serverNow: number }) {
  const [now,setNow] = useState(serverNow);
  useEffect(() => { if (!start || end) return; const localStart = Date.now(); const timer = setInterval(() => setNow(serverNow + Date.now() - localStart), 1000); return () => clearInterval(timer); }, [start,end,serverNow]);
  if (!start) return <span>Não iniciada</span>;
  const minutes = Math.max(0,Math.floor(((end ? new Date(end).getTime() : now) - new Date(start).getTime()) / 60000));
  return <span>{Math.floor(minutes/60)}h {String(minutes%60).padStart(2,"0")}min</span>;
}
