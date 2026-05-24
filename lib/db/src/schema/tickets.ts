import { pgTable, serial, text, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const uploadsTable = pgTable("ta2_uploads", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalHeaders: jsonb("original_headers").notNull(),
  columnMapping: jsonb("column_mapping").notNull(),
  rowCount: integer("row_count").notNull(),
  weekLabel: text("week_label"),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  anomalyCount: integer("anomaly_count"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ticketsTable = pgTable("ta2_tickets", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull(),
  rawData: jsonb("raw_data").notNull(),
  ticketId: text("ticket_id"),
  ticketDate: text("ticket_date"),
  category: text("category"),
  priority: text("priority"),
  status: text("status"),
  assignee: text("assignee"),
  manager: text("manager"),
  description: text("description"),
  resolution: text("resolution"),
  aiCategory: text("ai_category"),
  isAnomaly: boolean("is_anomaly").default(false),
  dateOpening: text("date_opening"),
  dateClosed: text("date_closed"),
});

export const conversationsTable = pgTable("ta2_conversations", {
  id: text("id").primaryKey(),
  uploadId: integer("upload_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  lastQuestion: text("last_question"),
});

export const messagesTable = pgTable("ta2_messages", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ id: true, uploadedAt: true });
export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true });
export const insertConversationSchema = createInsertSchema(conversationsTable);
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, timestamp: true });

export type Upload = typeof uploadsTable.$inferSelect;
export type Ticket = typeof ticketsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
