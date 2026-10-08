"use client";

export default function SystemError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Não foi possível carregar o sistema</h1><p className="mt-4">Tente novamente. Se o problema persistir, contate o administrador.</p><button onClick={reset} className="mt-6 min-h-12 rounded-lg bg-blue-900 px-6 text-white">Tentar novamente</button></main>;
}
