"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: null });
  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-semibold">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className="mt-2 min-h-12 w-full rounded-lg border border-slate-400 px-4 focus:outline-2 focus:outline-blue-700" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-semibold">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className="mt-2 min-h-12 w-full rounded-lg border border-slate-400 px-4 focus:outline-2 focus:outline-blue-700" />
      </div>
      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.error}</p>}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-lg bg-blue-900 px-6 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60">{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
