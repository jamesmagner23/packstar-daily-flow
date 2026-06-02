import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";

const jobDailyTrackerSchema = z.object({
  job_id: z.string().uuid("Job required"),
  report_date: z.string().min(1, "Valid date required"),
  day_number: z.number().optional().nullable(),
  wp_code: z.string().min(1, "Work package required"),
  line_items_worked: z
    .array(
      z.object({
        boq_line_id: z.string().uuid(),
        pct_complete: z.number().min(0).max(100),
      }),
    )
    .default([]),
  hours_20t_op: z.number().min(0).max(24).default(0),
  hours_pipelayer: z.number().min(0).max(24).default(0),
  hours_dogman: z.number().min(0).max(24).default(0),
  hours_15t_op: z.number().min(0).max(24).default(0),
  days_20t: z.number().int().min(0).max(5).default(0),
  days_15t: z.number().int().min(0).max(5).default(0),
  days_tipper: z.number().int().min(0).max(5).default(0),
  fuel_sundry_spend: z.number().min(0).default(0),
  rain_delay_hours: z.number().min(0).max(24).default(0),
  other_delay_type: z.string().optional().nullable(),
  other_delay_hours: z.number().min(0).max(24).default(0),
  notes: z.string().optional().nullable(),
  wg_signed: z.boolean().default(false),
});

type JobDailyTrackerFormData = z.infer<typeof jobDailyTrackerSchema>;

interface BOQLine {
  id: string;
  ref: string;
  description: string;
  unit: string;
  rate: number;
}

interface LineItemWorked {
  boq_line_id: string;
  pct_complete: number;
}

interface JobDailyTrackerFormProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobDailyTrackerForm({
  jobId,
  open,
  onOpenChange,
}: JobDailyTrackerFormProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const initialForm: JobDailyTrackerFormData = {
    job_id: jobId,
    report_date: today,
    day_number: null,
    wp_code: "",
    line_items_worked: [],
    hours_20t_op: 0,
    hours_pipelayer: 0,
    hours_dogman: 0,
    hours_15t_op: 0,
    days_20t: 0,
    days_15t: 0,
    days_tipper: 0,
    fuel_sundry_spend: 0,
    rain_delay_hours: 0,
    other_delay_type: null,
    other_delay_hours: 0,
    notes: null,
    wg_signed: false,
  };

  const [form, setForm] = useState<JobDailyTrackerFormData>(initialForm);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    lineItems: true,
    labour: true,
    plant: true,
    costs: true,
    delays: false,
    notes: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof JobDailyTrackerFormData, string>>>({});

  const { data: boqLines, isLoading: boqLoading } = useQuery({
    queryKey: ["boq-lines", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_lines")
        .select("id, ref, description, unit, rate")
        .eq("project_id", jobId)
        .order("ref");
      if (error) throw error;
      return (data as BOQLine[]) || [];
    },
    enabled: open && !!jobId,
  });

  const { data: project } = useQuery({
    queryKey: ["project", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("code, name")
        .eq("id", jobId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!jobId,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: JobDailyTrackerFormData) => {
      const { error } = await (supabase as any)
        .from("job_daily_trackers")
        .insert([
          {
            ...data,
            line_items_worked:
              data.line_items_worked.length > 0 ? data.line_items_worked : null,
            other_delay_type: data.other_delay_type || null,
            notes: data.notes || null,
          },
        ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily report submitted");
      qc.invalidateQueries({ queryKey: ["job-daily-trackers", jobId] });
      qc.invalidateQueries({ queryKey: ["job-daily-trackers-pending"] });
      setForm(initialForm);
      onOpenChange(false);
    },
    onError: (err: any) => {
      const message =
        err?.message === "UNIQUE constraint failed"
          ? "Report already exists for this date"
          : err?.message || "Failed to submit";
      toast.error(`Error: ${message}`);
    },
  });

  const handleSubmit = async () => {
    try {
      const validated = jobDailyTrackerSchema.parse(form);
      setErrors({});
      await submitMutation.mutateAsync(validated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Partial<Record<keyof JobDailyTrackerFormData, string>> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            newErrors[e.path[0] as keyof JobDailyTrackerFormData] = e.message;
          }
        });
        setErrors(newErrors);
        toast.error(err.errors[0]?.message || "Validation error");
      }
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateLineItem = (boqLineId: string, pctComplete: number) => {
    setForm((prev) => ({
      ...prev,
      line_items_worked: prev.line_items_worked.map((item) =>
        item.boq_line_id === boqLineId ? { ...item, pct_complete: pctComplete } : item,
      ),
    }));
  };

  const toggleLineItem = (boqLineId: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      line_items_worked: checked
        ? [...prev.line_items_worked, { boq_line_id: boqLineId, pct_complete: 0 }]
        : prev.line_items_worked.filter((item) => item.boq_line_id !== boqLineId),
    }));
  };

  const labourFields: Array<{ key: keyof JobDailyTrackerFormData; label: string; value: number }> = [
    { key: "hours_20t_op", label: "20T Op", value: form.hours_20t_op },
    { key: "hours_pipelayer", label: "Pipelayer", value: form.hours_pipelayer },
    { key: "hours_dogman", label: "Dogman", value: form.hours_dogman },
    { key: "hours_15t_op", label: "15T Op", value: form.hours_15t_op },
  ];

  const plantFields: Array<{ key: keyof JobDailyTrackerFormData; label: string; value: number }> = [
    { key: "days_20t", label: "20T", value: form.days_20t },
    { key: "days_15t", label: "15T", value: form.days_15t },
    { key: "days_tipper", label: "Tipper", value: form.days_tipper },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-green-600 text-white grid place-content-center font-semibold">
              P
            </div>
            <div>
              <DialogTitle className="text-base">Daily Report</DialogTitle>
              <p className="text-xs text-gray-500">
                {project?.name || "Job"} • {form.report_date}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Date & WP */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-gray-700">Date</Label>
              <Input
                type="date"
                value={form.report_date}
                onChange={(e) => setForm({ ...form, report_date: e.target.value })}
                className="text-sm mt-2"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-700">Work Package *</Label>
              <Select
                value={form.wp_code}
                onValueChange={(v) => setForm({ ...form, wp_code: v })}
              >
                <SelectTrigger className="text-sm mt-2">
                  <SelectValue placeholder="Select WP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WP1">WP1</SelectItem>
                  <SelectItem value="WP2">WP2</SelectItem>
                  <SelectItem value="WP3">WP3</SelectItem>
                  <SelectItem value="WP4">WP4</SelectItem>
                  <SelectItem value="WP5">WP5</SelectItem>
                  <SelectItem value="MOB">MOB</SelectItem>
                </SelectContent>
              </Select>
              {errors.wp_code && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.wp_code}
                </p>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("lineItems")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Line Items</span>
              {expandedSections.lineItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.lineItems && (
              <div className="px-4 py-3 space-y-3 border-t">
                {boqLoading ? (
                  <p className="text-xs text-gray-500">Loading...</p>
                ) : boqLines && boqLines.length > 0 ? (
                  boqLines.map((line) => {
                    const worked = form.line_items_worked.find(
                      (w) => w.boq_line_id === line.id,
                    );
                    return (
                      <div key={line.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={!!worked}
                            onCheckedChange={(checked) =>
                              toggleLineItem(line.id, checked as boolean)
                            }
                            className="mt-1"
                          />
                          <div className="text-sm">
                            <div className="font-medium">{line.ref}</div>
                            <div className="text-xs text-gray-500">
                              {line.description} • {line.unit}
                            </div>
                          </div>
                        </div>
                        {worked && (
                          <div className="flex items-center gap-3 pl-6">
                            <Slider
                              value={[worked.pct_complete]}
                              onValueChange={(v) => updateLineItem(line.id, v[0])}
                              min={0}
                              max={100}
                              step={5}
                              className="flex-1"
                            />
                            <div className="text-right w-12">
                              <p className="text-sm font-medium">{worked.pct_complete}%</p>
                              <p className="text-[10px] text-gray-500">done</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500">No line items</p>
                )}
              </div>
            )}
          </div>

          {/* Crew Hours */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("labour")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Crew Hours</span>
              {expandedSections.labour ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.labour && (
              <div className="px-4 py-3 grid grid-cols-2 gap-3 border-t">
                {labourFields.map(({ key, label, value }) => (
                  <div key={key as string}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={value}
                      onChange={(e) =>
                        setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })
                      }
                      className="text-sm mt-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plant */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("plant")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Plant On Site</span>
              {expandedSections.plant ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.plant && (
              <div className="px-4 py-3 grid grid-cols-3 gap-3 border-t">
                {plantFields.map(({ key, label, value }) => (
                  <div key={key as string}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        setForm({ ...form, [key]: parseInt(e.target.value) || 0 })
                      }
                      className="text-sm mt-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Costs */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("costs")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Fuel & Sundry</span>
              {expandedSections.costs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.costs && (
              <div className="px-4 py-3 border-t">
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.fuel_sundry_spend}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fuel_sundry_spend: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm mt-2"
                />
              </div>
            )}
          </div>

          {/* Delays */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("delays")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Delays & Issues</span>
              {expandedSections.delays ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.delays && (
              <div className="px-4 py-3 space-y-3 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.rain_delay_hours > 0}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, rain_delay_hours: checked ? 1 : 0 })
                    }
                  />
                  <span className="text-sm">Rain delay</span>
                </label>
                {form.rain_delay_hours > 0 && (
                  <Input
                    type="number"
                    step="0.5"
                    value={form.rain_delay_hours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rain_delay_hours: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="text-sm"
                  />
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.other_delay_type !== null}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        other_delay_type: checked ? "" : null,
                        other_delay_hours: 0,
                      })
                    }
                  />
                  <span className="text-sm">Other delay</span>
                </label>
                {form.other_delay_type !== null && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="text"
                      placeholder="Type"
                      value={form.other_delay_type || ""}
                      onChange={(e) =>
                        setForm({ ...form, other_delay_type: e.target.value })
                      }
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="Hours"
                      value={form.other_delay_hours}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          other_delay_hours: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection("notes")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium">Notes & Sign-off</span>
              {expandedSections.notes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSections.notes && (
              <div className="px-4 py-3 space-y-3 border-t">
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={form.notes || ""}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value || null })
                    }
                    className="text-sm mt-2 h-16 resize-none"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-white rounded-xl border border-green-100 hover:bg-green-50/30 transition">
                  <Checkbox
                    checked={form.wg_signed}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, wg_signed: checked as boolean })
                    }
                  />
                  <span className="text-sm font-medium text-gray-900">
                    WG rep signed off
                  </span>
                  {form.wg_signed && (
                    <CheckCircle2 size={16} className="ml-auto text-green-600" />
                  )}
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-gray-100 bg-gray-50 px-6 py-4 flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || !form.wp_code}
            className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
