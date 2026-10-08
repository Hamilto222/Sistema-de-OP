"use client";
import { useActionState, useRef, useState } from "react";
import { deactivateRecord } from "@/features/admin/actions";
import { emptyActionState, type AdminKind } from "@/features/admin/schemas";
import { FormErrors } from "./admin-ui";

export function DeactivateConfirmation({ kind, id, stamp, label }: { kind: AdminKind; id: string; stamp: string; label: string }) {
  const [state, action, pending] = useActionState(deactivateRecord.bind(null, kind), emptyActionState);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { dialog.current?.close(); setOpen(false); };
  return <><button type="button" className="button-secondary text-red-800" onClick={() => { setOpen(true); dialog.current?.showModal(); }}>Desativar</button>
    <dialog ref={dialog} onClose={() => setOpen(false)} className="m-auto max-h-[90vh] w-[min(90vw,32rem)] overflow-y-auto rounded-xl border-0 p-6 shadow-xl backdrop:bg-slate-950/40" aria-labelledby={`confirm-${id}`}>
      {open && <><h2 id={`confirm-${id}`} className="text-xl font-bold">Desativar cadastro?</h2><p className="my-4">{label} ficará inativo. O histórico será preservado e você poderá reativá-lo na edição.</p>
        <form action={action} className="space-y-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="updated_at" value={stamp} /><FormErrors state={state} />
          <div className="flex flex-wrap justify-end gap-3"><button type="button" className="button-secondary" onClick={close}>Cancelar</button><button type="submit" disabled={pending} className="button-primary bg-red-800">{pending ? "Desativando…" : "Confirmar desativação"}</button></div>
        </form></>}
    </dialog></>;
}
