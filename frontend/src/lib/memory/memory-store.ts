/**
 * MemoryStore adapter — sole gateway to teammate Supabase HTTP service.
 * If MEMORY_*_ENDPOINT env vars are unset, an in-memory mock is used.
 */

import { getConfig, usingRemoteMemory } from "@/lib/config";
import { ragIndex, ragSearch, type RagSearchHit } from "@/lib/memory/rag-client";
import { makeImagePath, uploadScreenshot } from "@/lib/memory/supabase-storage";
import type { MemoryAnalysis, MemoryRecord, MemorySearchHit } from "@/lib/schemas/memory";

type GlobalStore = {
  memories: Map<string, MemoryRecord>;
  seeded: boolean;
};

function store(): GlobalStore {
  const g = globalThis as typeof globalThis & { __snapactMemory?: GlobalStore };
  if (!g.__snapactMemory) {
    g.__snapactMemory = { memories: new Map(), seeded: false };
  }
  return g.__snapactMemory;
}

function nowIso() {
  return new Date().toISOString();
}

function isUnfinishedMemory(mem: {
  searchable_text?: string;
  metadata?: Record<string, unknown>;
  analysis?: MemoryAnalysis | null;
}) {
  const blob = `${mem.analysis?.title || ""} ${mem.analysis?.description || ""} ${mem.searchable_text || ""} ${JSON.stringify(mem.metadata || {})}`;
  return (
    mem.metadata?.pending === true ||
    /analysis is running in the background/i.test(blob) ||
    /pending analysis/i.test(blob)
  );
}

function inferContentType(hit: RagSearchHit): string {
  const cat = String(hit.category || hit.metadata.category || "").toLowerCase();
  const known = [
    "event",
    "quote",
    "knowledge",
    "idea",
    "place",
    "product",
    "job",
    "person_followup",
    "conversation",
    "document",
    "other",
  ];
  if (known.includes(cat)) return cat;
  const blob = `${hit.description} ${hit.ocr_text} ${JSON.stringify(hit.metadata)}`.toLowerCase();
  if (cat === "entertainment" || /quote|tweet|post/.test(blob)) return "quote";
  if (/hackathon|meetup|conference|event|rsvp/.test(blob)) return "event";
  if (/follow up|linkedin|contact|person/.test(blob)) return "person_followup";
  if (/restaurant|cafe|map|place|venue/.test(blob)) return "place";
  if (/idea|brainstorm/.test(blob)) return "idea";
  return cat || "other";
}

function titleFromHit(hit: RagSearchHit, contentType: string) {
  const meta = hit.metadata;
  const explicit = [meta.title, meta.movie, meta.name, meta.event].find(
    (value) => typeof value === "string" && value.trim(),
  ) as string | undefined;
  if (explicit) return explicit;
  const line = hit.description.split(/[.!\n]/)[0]?.trim();
  if (line) return line.slice(0, 80);
  if (contentType === "quote") return "Saved quote";
  return hit.memory_id.slice(0, 12);
}

function seedDemoIfNeeded() {
  const s = store();
  if (s.seeded) return;
  s.seeded = true;
  if (usingRemoteMemory()) return;
  const userId = getConfig().demoUserId;
  const placeholder =
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect fill="#e8f4f2" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#0f766e" font-family="sans-serif" font-size="28">SnapAct demo</text></svg>`,
    ).toString("base64");

  const seeds: Array<{ id: string; analysis: MemoryAnalysis }> = [
    {
      id: "mem_demo_event",
      analysis: {
        title: "Cursor × Grok Hackathon",
        content_type: "event",
        intent_mode: "ACT",
        intent_summary: "User may want to attend this hackathon.",
        description: "AI hackathon in Austin focused on Grok 4.6 and agents.",
        searchable_text:
          "Cursor Grok AI hackathon in Austin. Developer event about Grok 4.6, agents and AI tools. Intent: ACT. Category: event. Location: Austin Texas.",
        tags: ["AI", "hackathon", "Austin", "Grok"],
        entities: [
          { name: "Cursor", type: "company" },
          { name: "Austin", type: "location" },
        ],
        actionable: true,
        urgency: "high",
        needs_live_search: true,
        confidence: 0.93,
        suggested_actions: [
          { type: "register", label: "Register", reason: "Event approaching" },
          { type: "add_calendar", label: "Add to Calendar" },
        ],
        event: { name: "Cursor × Grok Hackathon", date: "2026-08-22", location: "Austin, TX" },
        temporal: { event_date: "2026-08-22", is_upcoming: true },
        citations: [],
        agent_activity: ["Screenshot understood", "Event detected"],
        short_message: "Saved Cursor × Grok Hackathon as an actionable event.",
      },
    },
    {
      id: "mem_demo_quote_1",
      analysis: {
        title: "Stay hungry, stay foolish",
        content_type: "quote",
        intent_mode: "REMEMBER",
        intent_summary: "User wants to remember this quote.",
        description: "Classic Steve Jobs quote about curiosity and ambition.",
        searchable_text: "Stay hungry stay foolish quote. Category: quote. Intent: REMEMBER.",
        tags: ["quote", "inspiration"],
        entities: [{ name: "Steve Jobs", type: "person" }],
        actionable: false,
        urgency: "none",
        needs_live_search: false,
        confidence: 0.96,
        suggested_actions: [{ type: "save", label: "Saved" }],
        citations: [],
        agent_activity: ["Screenshot understood", "Quote identified"],
        short_message: "Saved quote: Stay hungry, stay foolish.",
      },
    },
    {
      id: "mem_demo_quote_2",
      analysis: {
        title: "Execution eats strategy",
        content_type: "quote",
        intent_mode: "REMEMBER",
        intent_summary: "User saved a quote about execution.",
        description: "Reminder that shipping beats planning theater.",
        searchable_text: "Execution eats strategy quote. Category: quote. Intent: REMEMBER.",
        tags: ["quote", "execution"],
        entities: [],
        actionable: false,
        urgency: "none",
        needs_live_search: false,
        confidence: 0.9,
        suggested_actions: [],
        citations: [],
        agent_activity: ["Screenshot understood"],
        short_message: "Saved quote about execution.",
      },
    },
    {
      id: "mem_demo_followup",
      analysis: {
        title: "Follow up with Sarah",
        content_type: "person_followup",
        intent_mode: "ACT",
        intent_summary: "User wants to follow up about a referral.",
        description: "Note to contact Sarah about a referral conversation.",
        searchable_text: "Follow up with Sarah about referral. Category: person_followup. Intent: ACT.",
        tags: ["people", "referral"],
        entities: [{ name: "Sarah", type: "person" }],
        actionable: true,
        urgency: "medium",
        needs_live_search: false,
        confidence: 0.88,
        suggested_actions: [{ type: "follow_up", label: "Follow up" }],
        person_followup: { person_name: "Sarah", topic: "referral", due_hint: "this week" },
        citations: [],
        agent_activity: ["Screenshot understood", "Follow-up identified"],
        short_message: "Saved follow-up with Sarah.",
      },
    },
    {
      id: "mem_demo_place",
      analysis: {
        title: "Franklin Barbecue",
        content_type: "place",
        intent_mode: "EXPLORE",
        intent_summary: "User is considering this restaurant for a possible visit.",
        description: "Austin BBQ spot the user may want to visit.",
        searchable_text:
          "Franklin Barbecue restaurant in Austin. Potential birthday dinner restaurant. Category: place. Intent: EXPLORE.",
        tags: ["restaurant", "Austin", "BBQ", "birthday"],
        entities: [
          { name: "Franklin Barbecue", type: "place" },
          { name: "Austin", type: "location" },
        ],
        actionable: true,
        urgency: "low",
        needs_live_search: false,
        confidence: 0.87,
        suggested_actions: [{ type: "research", label: "Explore" }],
        place: { name: "Franklin Barbecue", city: "Austin", category: "restaurant" },
        user_description: "Potential restaurant for birthday dinner",
        citations: [],
        agent_activity: ["Screenshot understood", "Place identified"],
        short_message: "Saved Franklin Barbecue as a place to explore.",
      },
    },
    {
      id: "mem_demo_knowledge",
      analysis: {
        title: "Grok Responses API notes",
        content_type: "knowledge",
        intent_mode: "REMEMBER",
        intent_summary: "User saved API documentation notes.",
        description: "Notes about multimodal inputs and tools.",
        searchable_text: "Grok API knowledge notes. Category: knowledge. Intent: REMEMBER.",
        tags: ["Grok", "API", "knowledge"],
        entities: [],
        actionable: false,
        urgency: "none",
        needs_live_search: false,
        confidence: 0.85,
        suggested_actions: [],
        citations: [],
        agent_activity: ["Screenshot understood"],
        short_message: "Saved Grok API knowledge notes.",
      },
    },
  ];

  const created = nowIso();
  for (const seed of seeds) {
    s.memories.set(seed.id, {
      memory_id: seed.id,
      user_id: userId,
      image_url: placeholder,
      created_at: created,
      searchable_text: seed.analysis.searchable_text,
      metadata: {
        title: seed.analysis.title,
        content_type: seed.analysis.content_type,
        intent_mode: seed.analysis.intent_mode,
        description: seed.analysis.description,
        tags: seed.analysis.tags,
        demo_seed: true,
        analysis: seed.analysis,
      },
      analysis: seed.analysis,
      source: "demo-seed",
      captured_at: created,
    });
  }
}

export class MemoryStore {
  get usingRemote() {
    return usingRemoteMemory();
  }

  async saveMemory(input: {
    userId: string;
    imageBytes: Buffer;
    contentType: string;
    metadata: Record<string, unknown>;
    searchableText: string;
    clientRequestId?: string | null;
    skipUpload?: boolean;
  }): Promise<{ memory_id: string; image_url: string | null; created_at: string; duplicate?: boolean }> {
    seedDemoIfNeeded();
    const cfg = getConfig();

    if (cfg.memorySaveEndpoint) {
      try {
        const analysis = (input.metadata.analysis as MemoryAnalysis) || null;
        const externalId = input.clientRequestId || crypto.randomUUID();
        const imagePath = makeImagePath(externalId, input.contentType);
        let imageUrl: string | null = null;
        if (
          !input.skipUpload &&
          cfg.supabaseUrl &&
          (cfg.supabaseSecretKey || cfg.supabasePublishableKey)
        ) {
          const uploaded = await uploadScreenshot({
            imageBytes: input.imageBytes,
            contentType: input.contentType,
            imagePath,
          });
          imageUrl = uploaded.imageUrl;
        }
        const payload = await ragIndex({
          externalId,
          imagePath,
          contentType: input.contentType,
          description: [
            "Saved screenshot",
            analysis?.title,
            (input.metadata.description as string) || analysis?.description,
            input.searchableText,
          ]
            .filter((part) => typeof part === "string" && part.trim())
            .join(". ")
            .slice(0, 4000),
          ocrText: analysis?.extracted_text_summary || input.searchableText,
          category: (input.metadata.content_type as string) || analysis?.content_type || "other",
          metadata: {
            user_id: input.userId,
            searchable_text: input.searchableText,
            content_type: analysis?.content_type,
            intent_mode: analysis?.intent_mode,
            title: analysis?.title,
            tags: analysis?.tags,
            event: analysis?.event,
            temporal: analysis?.temporal || input.metadata.temporal,
            suggested_actions: analysis?.suggested_actions,
            source: input.metadata.source,
          },
        });
        const record: MemoryRecord = {
          memory_id: payload.memory_id,
          user_id: input.userId,
          image_url: imageUrl || payload.image_url,
          created_at: payload.created_at,
          searchable_text: input.searchableText,
          metadata: input.metadata,
          analysis: (input.metadata.analysis as MemoryAnalysis) || null,
          source: (input.metadata.source as string) || null,
          captured_at: (input.metadata.captured_at as string) || null,
          question: (input.metadata.question as string) || null,
          user_description: (input.metadata.user_description as string) || null,
          client_request_id: input.clientRequestId || null,
        };
        store().memories.set(payload.memory_id, record);
        return {
          memory_id: payload.memory_id,
          image_url: record.image_url ?? null,
          created_at: record.created_at,
        };
      } catch (error) {
        console.warn("RAG index failed; falling back to mock store", error);
        return this.mockSave(input);
      }
    }

    return this.mockSave(input);
  }

  async searchMemories(input: {
    userId: string;
    query: string;
    topK?: number;
    filters?: Record<string, unknown>;
    requireImage?: boolean;
    signImages?: boolean;
  }): Promise<MemorySearchHit[]> {
    seedDemoIfNeeded();
    const cfg = getConfig();
    if (cfg.memorySearchEndpoint) {
      try {
        const hits = await ragSearch({
          query: input.query,
          topK: input.topK ?? 5,
          signImages: input.signImages,
        });
        return hits
          .map((item) => this.hitToSearch(item))
          .filter((hit) => (input.requireImage === false || Boolean(hit.image_url)) && !isUnfinishedMemory(hit));
      } catch (error) {
        console.warn("RAG search failed; falling back to mock store", error);
        if (usingRemoteMemory()) return [];
        return this.mockSearch(input);
      }
    }
    return this.mockSearch(input);
  }

  async listRecent(input: {
    userId: string;
    limit?: number;
    filters?: Record<string, unknown>;
  }): Promise<MemoryRecord[]> {
    seedDemoIfNeeded();
    const cfg = getConfig();
    if (cfg.memorySearchEndpoint && !cfg.memoryListEndpoint) {
      try {
        const filterType = String(input.filters?.content_type || "").trim();
        const probes = filterType
          ? [filterType]
          : ["screenshot", "event", "quote", "place", "research", "remember"];
        const batches = await Promise.all(
          probes.map((query) =>
            ragSearch({ query, topK: 12 }).catch((error) => {
              console.warn(`RAG list probe failed query=${query}`, error);
              return [] as RagSearchHit[];
            }),
          ),
        );
        const byId = new Map<string, MemoryRecord>();
        for (const hit of batches.flat()) {
          const record = this.hitToRecord(hit, input.userId);
          if (isUnfinishedMemory(record)) continue;
          const prev = byId.get(record.memory_id);
          if (!prev || (prev.created_at || "") < (record.created_at || "")) {
            byId.set(record.memory_id, record);
          }
        }
        for (const mem of store().memories.values()) {
          if (mem.user_id !== input.userId || isUnfinishedMemory(mem)) continue;
          byId.set(mem.memory_id, mem);
        }
        let records = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        if (filterType) {
          records = records.filter((mem) => {
            const ct = String(mem.analysis?.content_type || mem.metadata.content_type || "");
            return ct === filterType;
          });
        }
        records = records.slice(0, input.limit ?? 40);
        if (records.length || usingRemoteMemory()) return records;
      } catch (error) {
        console.warn("RAG list via search failed; using local/mock", error);
        if (usingRemoteMemory()) return [];
      }
    }
    if (cfg.memoryListEndpoint) {
      const url = new URL(cfg.memoryListEndpoint);
      url.searchParams.set("user_id", input.userId);
      url.searchParams.set("limit", String(input.limit ?? 40));
      const res = await fetch(url, { signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs) });
      if (!res.ok) throw new Error(`Memory list failed (${res.status})`);
      const payload = await res.json();
      const items = payload.memories || payload.results || payload;
      return items as MemoryRecord[];
    }
    return this.mockList(input);
  }

  async getMemory(input: { userId: string; memoryId: string }): Promise<MemoryRecord | null> {
    seedDemoIfNeeded();
    const cfg = getConfig();
    const local = store().memories.get(input.memoryId);
    if (local && local.user_id === input.userId) return local;
    if (cfg.memorySearchEndpoint && !cfg.memoryGetEndpoint) {
      try {
        const listed = await this.listRecent({ userId: input.userId, limit: 40 });
        const found = listed.find(
          (mem) =>
            mem.memory_id === input.memoryId ||
            mem.metadata.external_id === input.memoryId,
        );
        if (found) return found;
        const hits = await ragSearch({
          query: input.memoryId,
          topK: 8,
        });
        const match =
          hits.find((hit) => hit.memory_id === input.memoryId) ||
          hits.find((hit) => hit.metadata.external_id === input.memoryId);
        if (match) return this.hitToRecord(match, input.userId);
      } catch (error) {
        console.warn("RAG get via search failed", error);
      }
    }
    if (cfg.memoryGetEndpoint) {
      let url = cfg.memoryGetEndpoint;
      if (url.includes("{memory_id}")) url = url.replace("{memory_id}", input.memoryId);
      else url = `${url.replace(/\/$/, "")}/${input.memoryId}`;
      const res = await fetch(`${url}?user_id=${encodeURIComponent(input.userId)}`, {
        signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Memory get failed (${res.status})`);
      return (await res.json()) as MemoryRecord;
    }
    return null;
  }

  private hitToSearch(item: RagSearchHit): MemorySearchHit {
    const record = this.hitToRecord(item, getConfig().demoUserId);
    return {
      memory_id: record.memory_id,
      score: item.score,
      image_url: record.image_url,
      metadata: record.metadata,
      analysis: record.analysis,
    };
  }

  private hitToRecord(item: RagSearchHit, userId: string): MemoryRecord {
    const externalId = String(item.metadata.external_id || "");
    const local =
      store().memories.get(item.memory_id) ||
      (externalId ? store().memories.get(externalId) : undefined);
    const contentType = inferContentType(item);
    const title = titleFromHit(item, contentType);
    const existing = (item.metadata.analysis as MemoryAnalysis) || local?.analysis || null;
    const analysis: MemoryAnalysis =
      existing ||
      ({
        title,
        content_type: contentType as MemoryAnalysis["content_type"],
        intent_mode: (item.metadata.intent_mode as MemoryAnalysis["intent_mode"]) || "REMEMBER",
        intent_summary: item.description || "Saved screenshot",
        description: item.description,
        searchable_text: [item.description, item.ocr_text, item.metadata.searchable_text]
          .filter(Boolean)
          .join("\n"),
        tags: [item.category, item.metadata.platform, item.metadata.movie].filter(
          (value): value is string => typeof value === "string" && Boolean(value),
        ),
        entities: [],
        extracted_text_summary: item.ocr_text || null,
        actionable: contentType === "event" || contentType === "person_followup",
        urgency: "none",
        needs_live_search: false,
        confidence: item.score || 0.7,
        suggested_actions: (item.metadata.suggested_actions as MemoryAnalysis["suggested_actions"]) || [],
        temporal: (item.metadata.temporal as Record<string, unknown>) || null,
        citations: [],
        agent_activity: ["Loaded from SnapAct memory"],
      } as MemoryAnalysis);
    if (!analysis.temporal && item.metadata.temporal) {
      analysis.temporal = item.metadata.temporal as Record<string, unknown>;
    }
    const metadata = {
      ...item.metadata,
      title,
      content_type: contentType,
      category: item.category,
      description: item.description,
      analysis,
    };
    const record: MemoryRecord = {
      memory_id: item.memory_id,
      user_id: userId,
      image_url: item.image_url || local?.image_url || null,
      created_at: item.created_at || local?.created_at || nowIso(),
      searchable_text: analysis.searchable_text,
      metadata,
      analysis,
      source: (item.metadata.source as string) || local?.source || "rag",
      captured_at: (item.metadata.captured_at as string) || item.created_at || local?.captured_at || null,
      question: (item.metadata.question as string) || local?.question || null,
      user_description:
        (item.metadata.user_description as string) || local?.user_description || null,
      client_request_id:
        (item.metadata.client_request_id as string) || local?.client_request_id || null,
    };
    store().memories.set(record.memory_id, record);
    return record;
  }

  async updateMemory(input: {
    userId: string;
    memoryId: string;
    patch: Record<string, unknown>;
  }): Promise<MemoryRecord | null> {
    seedDemoIfNeeded();
    const cfg = getConfig();
    // TODO(teammate): plug MEMORY_UPDATE_ENDPOINT
    if (cfg.memoryUpdateEndpoint) {
      let url = cfg.memoryUpdateEndpoint;
      if (url.includes("{memory_id}")) url = url.replace("{memory_id}", input.memoryId);
      else url = `${url.replace(/\/$/, "")}/${input.memoryId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: input.userId, ...input.patch }),
        signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Memory update failed (${res.status})`);
      return (await res.json()) as MemoryRecord;
    }
    const mem = store().memories.get(input.memoryId);
    if (!mem || mem.user_id !== input.userId) return null;
    const updated: MemoryRecord = {
      ...mem,
      completed: input.patch.completed !== undefined ? Boolean(input.patch.completed) : mem.completed,
      updated_at: nowIso(),
      metadata: { ...mem.metadata, ...(input.patch.metadata as object) },
    };
    store().memories.set(input.memoryId, updated);
    return updated;
  }

  private mockSave(input: {
    userId: string;
    imageBytes: Buffer;
    contentType: string;
    metadata: Record<string, unknown>;
    searchableText: string;
    clientRequestId?: string | null;
  }) {
    if (input.clientRequestId) {
      for (const mem of store().memories.values()) {
        if (mem.client_request_id === input.clientRequestId && mem.user_id === input.userId) {
          return {
            memory_id: mem.memory_id,
            image_url: mem.image_url || null,
            created_at: mem.created_at,
            duplicate: true,
          };
        }
      }
    }
    const memoryId = `mem_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const imageUrl = `data:${input.contentType};base64,${input.imageBytes.toString("base64")}`;
    const analysis = (input.metadata.analysis as MemoryAnalysis) || null;
    const created = nowIso();
    const record: MemoryRecord = {
      memory_id: memoryId,
      user_id: input.userId,
      image_url: imageUrl,
      created_at: created,
      updated_at: created,
      searchable_text: input.searchableText,
      metadata: input.metadata,
      analysis,
      source: (input.metadata.source as string) || null,
      captured_at: (input.metadata.captured_at as string) || null,
      question: (input.metadata.question as string) || null,
      user_description: (input.metadata.user_description as string) || null,
      client_request_id: input.clientRequestId || null,
    };
    store().memories.set(memoryId, record);
    return { memory_id: memoryId, image_url: imageUrl, created_at: created };
  }

  private mockSearch(input: {
    userId: string;
    query: string;
    topK?: number;
    filters?: Record<string, unknown>;
  }): MemorySearchHit[] {
    const tokens = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const hits: Array<{ score: number; mem: MemoryRecord }> = [];
    for (const mem of store().memories.values()) {
      if (mem.user_id !== input.userId) continue;
      const ct = input.filters?.content_type;
      if (ct && mem.metadata.content_type !== ct) continue;
      const blob = [
        mem.searchable_text,
        String(mem.metadata.title || ""),
        String(mem.metadata.description || ""),
        ...(Array.isArray(mem.metadata.tags) ? (mem.metadata.tags as string[]) : []),
        mem.user_description || "",
        mem.question || "",
      ]
        .join(" ")
        .toLowerCase();
      let score = tokens.length ? tokens.filter((t) => blob.includes(t)).length / tokens.length : 0.1;
      if (score > 0) hits.push({ score, mem });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, input.topK ?? 8).map(({ score, mem }) => ({
      memory_id: mem.memory_id,
      score: Math.round(score * 10000) / 10000,
      image_url: mem.image_url,
      metadata: mem.metadata,
      analysis: mem.analysis,
    }));
  }

  private mockList(input: {
    userId: string;
    limit?: number;
    filters?: Record<string, unknown>;
  }): MemoryRecord[] {
    let items = [...store().memories.values()].filter((m) => m.user_id === input.userId);
    const ct = input.filters?.content_type;
    if (ct && ct !== "all") {
      items = items.filter(
        (m) => (m.analysis?.content_type || m.metadata.content_type) === ct,
      );
    }
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return items.slice(0, input.limit ?? 40);
  }
}

let singleton: MemoryStore | null = null;

export function getMemoryStore() {
  if (!singleton) singleton = new MemoryStore();
  return singleton;
}

export function resetMemoryStoreForTests() {
  const g = globalThis as typeof globalThis & { __snapactMemory?: GlobalStore };
  g.__snapactMemory = { memories: new Map(), seeded: false };
  singleton = new MemoryStore();
  return singleton;
}
