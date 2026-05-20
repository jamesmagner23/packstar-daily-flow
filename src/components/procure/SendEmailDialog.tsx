import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendSupplierEmail } from "@/lib/procure/send-email.functions";

type Kind = "rfq" | "po";

const schema = z.object({
  to: z.string().trim().email("Valid email required").max(255),
  subject: z.string().trim().min(1, "Subject required").max(300),
  body: z.string().trim().min(1, "Message required").max(20000),
});

export function SendEmailDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  defaultTo,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplierId: string;
  supplierName: string;
  defaultTo: string | null;
  kind: Kind;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendSupplierEmail);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ to?: string; subject?: string; body?: string }>({});

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo ?? "");
    const today = new Date().toISOString().slice(0, 10);
    if (kind === "rfq") {
      setSubject(`RFQ — PACC — ${today}`);
      setBody(
        `Hi ${supplierName} team,\n\nCould you please send pricing and availability for the items below?\n\n` +
          `  • [item, qty, dates]\n  • \n\nThanks,\nPACC HQ`,
      );
    } else {
      setSubject(`Purchase Order — PACC — ${today}`);
      setBody(
        `Hi ${supplierName} team,\n\nPlease accept the following order:\n\n  • [item, qty, dates, rate]\n  • \n\n` +
          `Please confirm by reply.\n\nThanks,\nPACC HQ`,
      );
    }
    setErrors({});
  }, [open, supplierName, defaultTo, kind]);

  const mutation = useMutation({
    mutationFn: async (values: { to: string; subject: string; body: string }) => {
      const res = await send({
        data: {
          supplierId,
          to: values.to,
          subject: values.subject,
          body: values.body,
          kind,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procure-email-log"] });
      toast.success(kind === "rfq" ? "Quote request sent" : "Purchase order sent");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  function submit() {
    const parsed = schema.safeParse({ to, subject, body });
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof typeof errs;
        if (!errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "rfq" ? "Request Quote" : "Send Purchase Order"} — {supplierName}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-meta">To *</Label>
            <Input className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} type="email" maxLength={255} />
            {errors.to && <p className="text-xs text-red-600 mt-1">{errors.to}</p>}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-meta">Subject *</Label>
            <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
            {errors.subject && <p className="text-xs text-red-600 mt-1">{errors.subject}</p>}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-meta">Message *</Label>
            <Textarea
              className="mt-1 font-mono text-sm"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={20000}
            />
            {errors.body && <p className="text-xs text-red-600 mt-1">{errors.body}</p>}
          </div>
          <p className="text-xs text-meta">
            Sent from your connected Gmail. Replies land back in that inbox and are auto-filed under this supplier.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : kind === "rfq" ? "Send Request" : "Send PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
