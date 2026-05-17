import { createFileRoute } from "@tanstack/react-router";
import { generateReportPdf, type ReportKind } from "@/lib/pdf/report-pdf.server";

export const Route = createFileRoute("/api/public/reports/pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = (url.searchParams.get("kind") ?? "project") as ReportKind;
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        const projectId = url.searchParams.get("projectId") ?? undefined;
        const crewName = url.searchParams.get("crewName") ?? undefined;

        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return new Response("Missing or invalid from/to", { status: 400 });
        }
        if (!["project", "crew", "plant", "all"].includes(kind)) {
          return new Response("Invalid kind", { status: 400 });
        }

        try {
          const bytes = await generateReportPdf({ kind, from, to, projectId, crewName });
          const filename = `pacc-${kind}-${from}-to-${to}.pdf`;
          return new Response(bytes as unknown as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (e: any) {
          return new Response(`PDF generation failed: ${e?.message ?? e}`, { status: 500 });
        }
      },
    },
  },
});
