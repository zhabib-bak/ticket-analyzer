import { Router } from "express";
import { db, ticketsTable, uploadsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, sql, and, isNull, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import https from "node:https";

const router = Router();

const AI_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-12b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "qwen/qwen3-8b:free",
];

async function callOpenRouter(model: string, messages: { role: string; content: string }[], maxTokens = 1200): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.5,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "openrouter.ai",
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "HTTP-Referer": "https://ticket-analyzer-ai.replit.app",
        "X-Title": "Ticket Analyzer AI",
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.error) return reject(new Error(json.error.message || "Provider error"));
          resolve((json.choices?.[0]?.message?.content || "").trim());
        } catch { reject(new Error("Invalid AI response")); }
      });
    });
    req.on("error", (e: Error) => reject(new Error("AI connection error: " + e.message)));
    req.write(body);
    req.end();
  });
}

async function callAI(messages: { role: string; content: string }[], maxTokens = 1200): Promise<string> {
  let lastErr: Error | null = null;
  for (const model of AI_MODELS) {
    try {
      return await callOpenRouter(model, messages, maxTokens);
    } catch (e: any) {
      console.log(`[AI] ${model} failed: ${e.message}`);
      lastErr = e;
    }
  }
  throw new Error("All AI models unavailable: " + lastErr?.message);
}

async function buildTicketContext(uploadId?: number | null, question?: string): Promise<string> {
  const where = uploadId ? eq(ticketsTable.uploadId, uploadId) : undefined;

  const [totalRes, byCategory, byPriority, byStatus, byAssignee] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(ticketsTable).where(where),
    db.select({ label: ticketsTable.category, n: sql<number>`count(*)` }).from(ticketsTable).where(where).groupBy(ticketsTable.category).orderBy(sql`count(*) desc`).limit(15),
    db.select({ label: ticketsTable.priority, n: sql<number>`count(*)` }).from(ticketsTable).where(where).groupBy(ticketsTable.priority).orderBy(sql`count(*) desc`),
    db.select({ label: ticketsTable.status, n: sql<number>`count(*)` }).from(ticketsTable).where(where).groupBy(ticketsTable.status).orderBy(sql`count(*) desc`),
    db.select({ label: ticketsTable.assignee, n: sql<number>`count(*)` }).from(ticketsTable).where(where).groupBy(ticketsTable.assignee).orderBy(sql`count(*) desc`).limit(10),
  ]);

  // Semantic search: find tickets most relevant to the question
  let relevantTickets: any[] = [];
  if (question) {
    const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keywords.length > 0) {
      const searchPattern = keywords.slice(0, 5).join("|");
      try {
        relevantTickets = await db.select({
          description: ticketsTable.description,
          category: ticketsTable.category,
          priority: ticketsTable.priority,
          status: ticketsTable.status,
          assignee: ticketsTable.assignee,
          resolution: ticketsTable.resolution,
        }).from(ticketsTable)
          .where(and(where, sql`lower(${ticketsTable.description}) ~* ${searchPattern}`))
          .limit(20);
      } catch { /* fallback to random */ }
    }
  }

  if (relevantTickets.length < 10) {
    const existing = new Set(relevantTickets.map((t) => t.description));
    const random = await db.select({
      description: ticketsTable.description,
      category: ticketsTable.category,
      priority: ticketsTable.priority,
      status: ticketsTable.status,
      assignee: ticketsTable.assignee,
      resolution: ticketsTable.resolution,
    }).from(ticketsTable).where(where).orderBy(sql`random()`).limit(30);
    for (const t of random) {
      if (!existing.has(t.description) && relevantTickets.length < 30) {
        relevantTickets.push(t);
      }
    }
  }

  return `DATOS DE TICKETS (Total: ${totalRes[0]?.n || 0})
Por categoría: ${byCategory.map((r) => `${r.label || "N/A"}(${r.n})`).join(", ")}
Por prioridad: ${byPriority.map((r) => `${r.label || "N/A"}(${r.n})`).join(", ")}
Por estado: ${byStatus.map((r) => `${r.label || "N/A"}(${r.n})`).join(", ")}
Por asignado: ${byAssignee.map((r) => `${r.label || "N/A"}(${r.n})`).join(", ")}
TICKETS RELEVANTES (${relevantTickets.length}):
${relevantTickets.map((t, i) => `[${i + 1}] ${t.description || "-"} | cat:${t.category || "-"} | pri:${t.priority || "-"} | est:${t.status || "-"} | asig:${t.assignee || "-"}`).join("\n")}`.trim();
}

// POST /api/ai/chat
router.post("/ai/chat", async (req, res) => {
  const { question, upload_id, conversation_id } = req.body as {
    question: string;
    upload_id?: number;
    conversation_id?: string;
  };

  if (!question?.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const convId = conversation_id || randomUUID();

  // Load or create conversation
  let conv = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId)).limit(1);
  if (!conv.length) {
    await db.insert(conversationsTable).values({
      id: convId,
      uploadId: upload_id || null,
      messageCount: 0,
      lastQuestion: question.slice(0, 200),
    });
  }

  // Load conversation history
  const history = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(messagesTable.timestamp)
    .limit(20);

  const context = await buildTicketContext(upload_id, question);

  const messages: { role: string; content: string }[] = [
    {
      role: "system",
      content: `Eres un analista experto de tickets de soporte operativo logístico (3PL/warehouse). Responde SIEMPRE en español. Sé conciso y analítico. Usa los datos reales del contexto. No inventes números. Si la pregunta es sobre patrones, tendencias o anomalías, proporciona insight accionable.\n\n${context}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  const answer = await callAI(messages, 1500);

  // Save messages
  await db.insert(messagesTable).values([
    { conversationId: convId, role: "user", content: question },
    { conversationId: convId, role: "assistant", content: answer },
  ]);

  // Update conversation stats
  await db.update(conversationsTable)
    .set({
      messageCount: (history.length / 2 + 1),
      lastQuestion: question.slice(0, 200),
      uploadId: upload_id || null,
    })
    .where(eq(conversationsTable.id, convId));

  const updatedHistory = [...history.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp?.toISOString() })),
    { role: "user", content: question, timestamp: new Date().toISOString() },
    { role: "assistant", content: answer, timestamp: new Date().toISOString() },
  ];

  res.json({ answer, conversation_id: convId, history: updatedHistory });
});

// POST /api/ai/analyze/:uploadId
router.post("/ai/analyze/:uploadId", async (req, res) => {
  const uploadId = parseInt(req.params.uploadId);

  const [upload] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, uploadId));
  if (!upload) { res.status(404).json({ error: "Upload not found" }); return; }

  const context = await buildTicketContext(uploadId);

  const [result, anomalyRes] = await Promise.all([
    callAI([
      {
        role: "system",
        content: `Eres un analista experto en operaciones de almacén y gestión de incidencias. Analiza los datos de tickets y proporciona insight ejecutivo. Responde ÚNICAMENTE con JSON válido sin texto adicional: {"summary":"...","key_findings":["..."],"recommendations":["..."],"top_categories":["..."],"risk_level":"low|medium|high|critical","anomalies_detected":N}`,
      },
      { role: "user", content: `Analiza estos tickets de operaciones logísticas y da un informe ejecutivo:\n${context}` },
    ], 1500),
    callAI([
      {
        role: "system",
        content: `Analiza los datos y detecta anomalías. Responde SOLO con JSON: {"anomaly_count":N}`,
      },
      { role: "user", content: `Cuántas anomalías ves en estos datos:\n${context}` },
    ], 200),
  ]);

  let parsed: any;
  try {
    parsed = JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    parsed = {
      summary: result,
      key_findings: [],
      recommendations: [],
      top_categories: [],
      risk_level: "medium",
      anomalies_detected: 0,
    };
  }

  let anomalyCount = 0;
  try { anomalyCount = JSON.parse(anomalyRes).anomaly_count || 0; } catch { /* ignore */ }

  // Save summary to upload
  await db.update(uploadsTable)
    .set({ aiSummary: parsed.summary, anomalyCount: anomalyCount || parsed.anomalies_detected })
    .where(eq(uploadsTable.id, uploadId));

  res.json(parsed);
});

// GET /api/ai/report/:uploadId
router.get("/ai/report/:uploadId", async (req, res) => {
  const uploadId = parseInt(req.params.uploadId);

  const [upload] = await db.select().from(uploadsTable).where(eq(uploadsTable.id, uploadId));
  if (!upload) { res.status(404).json({ error: "Upload not found" }); return; }

  const context = await buildTicketContext(uploadId);

  const markdown = await callAI([
    {
      role: "system",
      content: `Eres un analista de operaciones logísticas senior. Genera un informe ejecutivo completo en formato Markdown. El informe debe ser profesional, con secciones claras, tablas donde sea útil, y conclusiones accionables. Responde SOLO con el Markdown del informe, sin texto adicional antes o después.`,
    },
    {
      role: "user",
      content: `Genera un informe ejecutivo completo para este dataset de tickets:\n\nArchivo: ${upload.filename}\nSemana: ${upload.weekLabel || "N/A"}\nNotas: ${upload.notes || "Sin notas"}\n\n${context}\n\nEl informe debe incluir: Resumen Ejecutivo, Análisis por Categoría, Análisis por Prioridad, Análisis por Asignado, Tickets Críticos, Tendencias, Riesgos y Recomendaciones.`,
    },
  ], 3000);

  res.json({ markdown, generated_at: new Date().toISOString() });
});

// GET /api/ai/anomalies
router.get("/ai/anomalies", async (req, res) => {
  const uploadId = req.query.upload_id ? parseInt(req.query.upload_id as string) : null;
  const where = uploadId ? eq(ticketsTable.uploadId, uploadId) : undefined;

  const context = await buildTicketContext(uploadId);

  const result = await callAI([
    {
      role: "system",
      content: `Eres un experto en detección de anomalías en operaciones logísticas. Detecta patrones inusuales, picos, cuellos de botella, y riesgos operativos. Responde ÚNICAMENTE con JSON válido: {"anomalies":[{"type":"...","description":"...","severity":"critical|high|medium|low","affected_tickets":N,"affected_category":"..."}],"summary":"...","risk_score":0-100}`,
    },
    {
      role: "user",
      content: `Detecta anomalías y patrones inusuales en estos datos operativos. Busca: picos de P1, categorías con bloqueos frecuentes, asignados sobrecargados, tickets sin resolución, patrones temporales anómalos.\n\n${context}`,
    },
  ], 1500);

  let parsed: any;
  try {
    parsed = JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    parsed = { anomalies: [], summary: result, risk_score: 50 };
  }

  res.json(parsed);
});

// POST /api/ai/categorize/:uploadId
router.post("/ai/categorize/:uploadId", async (req, res) => {
  const uploadId = parseInt(req.params.uploadId);

  // Get uncategorized tickets
  const uncategorized = await db.select({
    id: ticketsTable.id,
    description: ticketsTable.description,
  }).from(ticketsTable)
    .where(and(eq(ticketsTable.uploadId, uploadId), isNull(ticketsTable.category)))
    .limit(50);

  if (!uncategorized.length) {
    res.json({ suggestions: [], applied: 0 });
    return;
  }

  // Get existing categories for context
  const existingCats = await db.select({ label: ticketsTable.category })
    .from(ticketsTable).where(eq(ticketsTable.uploadId, uploadId))
    .groupBy(ticketsTable.category).limit(20);
  const catList = existingCats.map((c) => c.label).filter(Boolean).join(", ");

  const ticketList = uncategorized.map((t, i) => `[${i}] ID:${t.id} "${t.description || "Sin descripción"}"`).join("\n");

  const result = await callAI([
    {
      role: "system",
      content: `Eres un experto en clasificación de tickets de soporte operativo logístico. Asigna categorías a los tickets. Categorías existentes en este dataset: ${catList || "ninguna aún"}. Responde SOLO con JSON array: [{"ticket_id":N,"suggested_category":"...","confidence":0.0-1.0}]`,
    },
    { role: "user", content: `Categoriza estos tickets:\n${ticketList}` },
  ], 1000);

  let suggestions: any[];
  try {
    suggestions = JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    suggestions = [];
  }

  // Apply high-confidence suggestions
  let applied = 0;
  for (const s of suggestions) {
    if (s.confidence >= 0.7 && s.ticket_id && s.suggested_category) {
      await db.update(ticketsTable)
        .set({ aiCategory: s.suggested_category, category: s.suggested_category })
        .where(eq(ticketsTable.id, s.ticket_id));
      applied++;
    }
  }

  res.json({ suggestions, applied });
});

// GET /api/ai/conversations
router.get("/ai/conversations", async (_req, res) => {
  const convs = await db.select().from(conversationsTable)
    .orderBy(desc(conversationsTable.createdAt)).limit(20);
  res.json(convs.map((c) => ({
    id: c.id,
    created_at: c.createdAt,
    message_count: c.messageCount,
    last_question: c.lastQuestion,
    upload_id: c.uploadId,
  })));
});

export default router;
