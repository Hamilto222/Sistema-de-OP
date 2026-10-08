"use client";
import { ErrorMessage } from "@/components/ui/admin-ui";
export default function OperatorError({ reset }: { reset: () => void }) { return <div className="space-y-4"><ErrorMessage>Não foi possível carregar os dados da operação. Verifique a conexão e tente novamente.</ErrorMessage><button className="button-primary" onClick={reset}>Tentar novamente</button></div>; }
