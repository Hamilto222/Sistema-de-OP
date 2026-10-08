"use client";
import { useActionState } from "react";
import { prepareOrder, uploadOriginal } from "./actions";
import { initialPcpState } from "./schemas";
import { Field, FormErrors } from "@/components/ui/admin-ui";
export function PrepareOrderForm({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(prepareOrder, initialPcpState);
  return <form action={action} className="space-y-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><FormErrors state={state} /><p className="text-sm text-slate-600">Preparar copia o modelo vigente para a OP e libera a produção. Os itens ficam independentes do modelo.</p><button type="submit" className="button-primary" disabled={pending}>{pending ? "Preparando…" : "Preparar OP"}</button></form>;
}
export function UploadOriginalForm({ id, version, hasPdf }: { id: string; version: number; hasPdf: boolean }) {
  const [state, action, pending] = useActionState(uploadOriginal, initialPcpState);
  return <form action={action} className="space-y-4"><h3 className="font-semibold">{hasPdf ? "Substituir PDF do rascunho" : "Anexar PDF original"}</h3><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><FormErrors state={state} /><Field name="pdf" label="PDF original" type="file" accept="application/pdf,.pdf" required /><p className="text-sm text-slate-600">Somente PDF, até 20 MB. Documentos anteriores ficam preservados no Storage privado.</p><button type="submit" className="button-secondary" disabled={pending}>{pending ? "Enviando…" : "Enviar PDF"}</button></form>;
}
