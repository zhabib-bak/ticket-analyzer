import { Router } from "express";
import Busboy from "busboy";
import { parse as csvParse } from "csv-parse/sync";
import { db, uploadsTable, ticketsTable } from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";

const router = Router();

const STANDARD_FIELDS = [
  "ticket_id", "ticket_date", "category", "priority",
  "status", "assignee", "description", "resolution",
];

function autoGuessMapping(headers: string[]): Record<string, string> {
  const rules: { field: string; patterns: RegExp[] }[] = [
    { field: "ticket_id", patterns: [/^id$/i, /ticket.?id/i, /numero/i, /number/i, /jd/i] },
    { field: "ticket_date", patterns: [/date.?open/i, /date_open/i, /fecha/i, /created/i, /^date$/i, /opening/i] },
    { field: "category", patterns: [/categ/i, /type/i, /tipo/i, /group/i] },
    { field: "priority", patterns: [/prior/i, /urgenc/i, /sever/i] },
    { field: "status", patterns: [/status/i, /estado/i, /state/i] },
    { field: "assignee", patterns: [/assign/i, /owner/i, /agent/i, /tecnico/i, /técnico/i] },
    { field: "description", patterns: [/desc/i, /title/i, /subject/i, /summary/i, /problem/i] },
    { field: "resolution", patterns: [/resol/i, /solution/i, /fix/i, /closed/i, /date.?clos/i] },
  ];
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const { field, patterns } of rules) {
    for (const h of headers) {
      if (used.has(field)) break;
      if (patterns.some((p) => p.test(h))) {
        map[h] = field;
        used.add(field);
        break;
      }
    }
  }
  return map;
}

function buildTicket(row: Record<string, string>, mapping: Record<string, string>) {
  const get = (f: string) => {
    const col = mapping[f];
    return col ? (row[col] || "").toString().trim() : "";
  };
  return {
    ticketId: get("ticket_id") || null,
    ticketDate: get("ticket_date") || null,
    category: get("category") || null,
    priority: get("priority") || null,
    status: get("status") || null,
    assignee: get("assignee") || null,
    description: get("description") || null,
    resolution: get("resolution") || null,
    rawData: row,
  };
}

// POST /api/tickets/upload
router.post("/tickets/upload", (req, res) => {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) {
    res.status(400).json({ error: "Expected multipart/form-data" });
    return;
  }

  const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } });
  let csvBuffer: Buffer | null = null;
  let fileName = "upload.csv";
  let weekLabel = "";
  let notes = "";
  let mappingJson = "";

  bb.on("file", (_name: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
    fileName = info.filename || "upload.csv";
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => { csvBuffer = Buffer.concat(chunks); });
  });
  bb.on("field", (name: string, val: string) => {
    if (name === "week_label") weekLabel = val;
    if (name === "notes") notes = val;
    if (name === "mapping") mappingJson = val;
  });
  bb.on("finish", async () => {
    try {
      if (!csvBuffer?.length) { res.status(400).json({ error: "No file received" }); return; }

      let rows: Record<string, string>[];
      try {
        rows = csvParse(csvBuffer, {
          columns: true, skip_empty_lines: true, trim: true,
          bom: true, relax_quotes: true, relax_column_count: true,
        }) as Record<string, string>[];
      } catch (e: any) {
        res.status(422).json({ error: "Cannot parse CSV: " + e.message });
        return;
      }

      if (!rows.length) { res.status(422).json({ error: "CSV has no rows" }); return; }

      const headers = Object.keys(rows[0]);
      const autoMap = autoGuessMapping(headers);

      if (!mappingJson) {
        res.json({
          step: "map_headers",
          headers,
          row_count: rows.length,
          sample: rows.slice(0, 3),
          auto_mapping: autoMap,
        });
        return;
      }

      let mapping: Record<string, string>;
      try { mapping = JSON.parse(mappingJson); }
      catch { res.status(400).json({ error: "Invalid mapping JSON" }); return; }

      // Invert mapping: standard_field -> csv_column
      const invertedMapping: Record<string, string> = {};
      for (const [csvCol, stdField] of Object.entries(mapping)) {
        invertedMapping[stdField] = csvCol;
      }

      const [upload] = await db.insert(uploadsTable).values({
        filename: fileName,
        originalHeaders: headers,
        columnMapping: mapping,
        rowCount: rows.length,
        weekLabel: weekLabel || null,
        notes: notes || null,
      }).returning();

      const ticketValues = rows.map((row) => {
        const t = buildTicket(row, invertedMapping);
        return {
          uploadId: upload.id,
          rawData: t.rawData,
          ticketId: t.ticketId,
          ticketDate: t.ticketDate,
          category: t.category,
          priority: t.priority,
          status: t.status,
          assignee: t.assignee,
          description: t.description,
          resolution: t.resolution,
        };
      });

      // Insert in batches of 100
      for (let i = 0; i < ticketValues.length; i += 100) {
        await db.insert(ticketsTable).values(ticketValues.slice(i, i + 100));
      }

      res.status(201).json({ ok: true, upload_id: upload.id, row_count: rows.length });
    } catch (err: any) {
      console.error("[upload error]", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });
  bb.on("error", (err: Error) => {
    res.status(500).json({ error: "Upload parsing error: " + err.message });
  });
  req.pipe(bb);
});

// GET /api/tickets/uploads
router.get("/tickets/uploads", async (_req, res) => {
  const uploads = await db.select().from(uploadsTable).orderBy(sql`${uploadsTable.uploadedAt} DESC`);
  res.json(uploads.map((u) => ({
    id: u.id,
    filename: u.filename,
    row_count: u.rowCount,
    week_label: u.weekLabel,
    notes: u.notes,
    uploaded_at: u.uploadedAt,
    ai_summary: u.aiSummary,
    anomaly_count: u.anomalyCount,
  })));
});

// DELETE /api/tickets/uploads/:id
router.delete("/tickets/uploads/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(ticketsTable).where(eq(ticketsTable.uploadId, id));
  await db.delete(uploadsTable).where(eq(uploadsTable.id, id));
  res.json({ ok: true });
});

// GET /api/tickets/dashboard
router.get("/tickets/dashboard", async (req, res) => {
  const uploadId = req.query.upload_id ? parseInt(req.query.upload_id as string) : null;
  const whereClause = uploadId ? eq(ticketsTable.uploadId, uploadId) : undefined;

  const [totalRes, byCategory, byPriority, byStatus, byAssignee, openP1, avgRes] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(ticketsTable).where(whereClause),
    db.select({ label: ticketsTable.category, value: sql<number>`count(*)` })
      .from(ticketsTable).where(whereClause)
      .groupBy(ticketsTable.category).orderBy(sql`count(*) desc`).limit(12),
    db.select({ label: ticketsTable.priority, value: sql<number>`count(*)` })
      .from(ticketsTable).where(whereClause)
      .groupBy(ticketsTable.priority).orderBy(sql`count(*) desc`),
    db.select({ label: ticketsTable.status, value: sql<number>`count(*)` })
      .from(ticketsTable).where(whereClause)
      .groupBy(ticketsTable.status).orderBy(sql`count(*) desc`),
    db.select({ label: ticketsTable.assignee, value: sql<number>`count(*)` })
      .from(ticketsTable).where(whereClause)
      .groupBy(ticketsTable.assignee).orderBy(sql`count(*) desc`).limit(10),
    db.select({ n: sql<number>`count(*)` }).from(ticketsTable)
      .where(and(whereClause, sql`lower(${ticketsTable.priority}) like '%p1%'`, sql`lower(${ticketsTable.status}) != 'closed'`)),
    db.select({ avg: sql<number>`avg(${uploadsTable.uploadedAt}::date - ${ticketsTable.ticketDate}::date)` })
      .from(ticketsTable).leftJoin(uploadsTable, eq(ticketsTable.uploadId, uploadsTable.id))
      .where(and(whereClause, sql`${ticketsTable.ticketDate} is not null`)),
  ]);

  // Week trend via join
  const byWeekQuery = await db.execute(
    uploadId
      ? sql`SELECT u.week_label as label, count(t.id)::int as value FROM ta2_tickets t JOIN ta2_uploads u ON t.upload_id = u.id WHERE t.upload_id = ${uploadId} GROUP BY u.week_label, u.uploaded_at ORDER BY u.uploaded_at`
      : sql`SELECT u.week_label as label, count(t.id)::int as value FROM ta2_tickets t JOIN ta2_uploads u ON t.upload_id = u.id GROUP BY u.week_label, u.uploaded_at ORDER BY u.uploaded_at`
  );

  res.json({
    total: Number(totalRes[0]?.n || 0),
    byCategory: byCategory.map((r) => ({ label: r.label || "N/A", value: Number(r.value) })),
    byPriority: byPriority.map((r) => ({ label: r.label || "N/A", value: Number(r.value) })),
    byStatus: byStatus.map((r) => ({ label: r.label || "N/A", value: Number(r.value) })),
    byAssignee: byAssignee.map((r) => ({ label: r.label || "N/A", value: Number(r.value) })),
    byWeek: (byWeekQuery.rows as any[]).map((r) => ({ label: r.label || "N/A", value: Number(r.value) })),
    openP1Count: Number(openP1[0]?.n || 0),
    avgResolutionDays: null,
  });
});

// GET /api/tickets/list
router.get("/tickets/list", async (req, res) => {
  const { upload_id, category, priority, status, assignee, limit: limitQ } = req.query as Record<string, string>;
  const conditions = [];
  if (upload_id) conditions.push(eq(ticketsTable.uploadId, parseInt(upload_id)));
  if (category) conditions.push(eq(ticketsTable.category, category));
  if (priority) conditions.push(eq(ticketsTable.priority, priority));
  if (status) conditions.push(eq(ticketsTable.status, status));
  if (assignee) conditions.push(eq(ticketsTable.assignee, assignee));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const lim = limitQ ? parseInt(limitQ) : 200;

  const tickets = await db.select().from(ticketsTable).where(whereClause).limit(lim);
  res.json(tickets.map((t) => ({
    id: t.id, upload_id: t.uploadId, ticket_id: t.ticketId,
    ticket_date: t.ticketDate, category: t.category, priority: t.priority,
    status: t.status, assignee: t.assignee, description: t.description,
    resolution: t.resolution, ai_category: t.aiCategory, is_anomaly: t.isAnomaly,
  })));
});

// GET /api/tickets/export
router.get("/tickets/export", async (req, res) => {
  const uploadId = req.query.upload_id ? parseInt(req.query.upload_id as string) : null;
  const whereClause = uploadId ? eq(ticketsTable.uploadId, uploadId) : undefined;
  const tickets = await db.select().from(ticketsTable).where(whereClause);

  const headers = ["ticket_id", "ticket_date", "category", "priority", "status", "assignee", "description", "resolution"];
  const esc = (v: any) => {
    const s = String(v ?? "");
    return s.match(/[,"\n]/) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...tickets.map((t) => [t.ticketId, t.ticketDate, t.category, t.priority, t.status, t.assignee, t.description, t.resolution].map(esc).join(",")),
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tickets${uploadId ? `_${uploadId}` : ""}.csv"`);
  res.send(csv);
});

export default router;
