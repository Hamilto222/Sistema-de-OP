"use client";
import { logout } from "@/features/auth/actions";
import { clearFormDrafts } from "@/hooks/use-form-draft";
export function LogoutButton() { return <form action={logout} onSubmit={clearFormDrafts}><button type="submit" className="button-secondary">Sair</button></form>; }
