"use client";
import { useState } from "react";
export function SuccessNotice({children,identity}:{children:React.ReactNode;identity:object}){
 const [dismissed,setDismissed]=useState<object|null>(null);
 if(dismissed===identity)return null;
 return <div role="status" className="notice-success"><p className="min-w-0 flex-1 break-words">{children}</p><button type="button" className="button-secondary shrink-0" aria-label="Fechar mensagem de sucesso" onClick={()=>setDismissed(identity)}>Fechar</button></div>;
}
