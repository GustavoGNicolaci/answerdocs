"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  MessageSquare,
  Quote,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatSimilarity } from "@/lib/utils";

type DocumentItem = {
  id: string;
  title: string;
  source_type: "pdf" | "text";
  status: "indexing" | "ready" | "failed";
  chunk_count: number;
  error_message: string | null;
  created_at: string;
};

type CitationItem = {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  similarity: number;
  snippet: string;
};

type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  citations: CitationItem[];
};

type UploadMode = "file" | "text";

export function RagWorkspace() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await readPayload<{ documents: DocumentItem[] }>(response);
      setDocuments(payload.documents);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setLoadingDocuments(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocuments();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUploading(true);

    try {
      const formData = new FormData();
      if (title.trim()) formData.append("title", title.trim());

      if (uploadMode === "file") {
        if (!file) throw new Error("Choose a PDF or .txt file.");
        formData.append("file", file);
      } else {
        if (!pastedText.trim()) throw new Error("Paste text before indexing.");
        formData.append("text", pastedText);
      }

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const payload = await readPayload<{ document: DocumentItem }>(response);

      setDocuments((current) => [payload.document, ...current]);
      setSelectedDocumentIds((current) => [...current, payload.document.id]);
      setNotice(`Indexed "${payload.document.title}".`);
      setFile(null);
      setTitle("");
      setPastedText("");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      await readPayload(response);
      setDocuments((current) =>
        current.filter((document) => document.id !== documentId),
      );
      setSelectedDocumentIds((current) =>
        current.filter((id) => id !== documentId),
      );
      setNotice("Document removed.");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion) return;

    setAsking(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: nextQuestion,
          documentIds:
            selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        }),
      });
      const payload = await readPayload<{
        answer: string;
        citations: CitationItem[];
      }>(response);

      setTurns((current) => [
        {
          id: crypto.randomUUID(),
          question: nextQuestion,
          answer: payload.answer,
          citations: payload.citations,
        },
        ...current,
      ]);
      setQuestion("");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setAsking(false);
    }
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-0 lg:grid-cols-[380px_1fr]">
        <aside className="border-b border-border bg-card/40 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">
                  AnswerDocs
                </h1>
                <p className="text-sm text-muted-foreground">RAG workspace</p>
              </div>
            </div>

            <Separator className="my-5" />

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Documents</h2>
                <Badge variant="secondary">{readyDocuments.length} ready</Badge>
              </div>

              <Tabs
                value={uploadMode}
                onValueChange={(value) => setUploadMode(value as UploadMode)}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="text">
                    <FileText className="mr-2 h-4 w-4" />
                    Paste
                  </TabsTrigger>
                </TabsList>

                <div className="space-y-2">
                  <Label htmlFor="document-title">Title</Label>
                  <Input
                    id="document-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Quarterly report"
                    disabled={uploading}
                  />
                </div>

                <TabsContent value="file">
                  <div className="space-y-2">
                    <Label htmlFor="document-file">File</Label>
                    <Input
                      id="document-file"
                      type="file"
                      accept="application/pdf,text/plain,.pdf,.txt"
                      disabled={uploading}
                      onChange={(event) =>
                        setFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {file ? `${file.name} · ${formatBytes(file.size)}` : "PDF or .txt, up to 10 MB"}
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="text">
                  <div className="space-y-2">
                    <Label htmlFor="document-text">Text</Label>
                    <Textarea
                      id="document-text"
                      value={pastedText}
                      onChange={(event) => setPastedText(event.target.value)}
                      placeholder="Paste document text here"
                      disabled={uploading}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {uploading ? <Progress value={66} /> : null}

              <Button type="submit" className="w-full" disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Index document
              </Button>
            </form>

            <Separator className="my-5" />

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Indexed files</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDocumentIds([])}
              >
                All
              </Button>
            </div>

            <ScrollArea className="mt-3 min-h-64 flex-1 pr-3">
              <div className="space-y-2">
                {loadingDocuments ? (
                  <DocumentState icon={Loader2} text="Loading documents" spin />
                ) : documents.length === 0 ? (
                  <DocumentState icon={FileText} text="No documents indexed" />
                ) : (
                  documents.map((document) => (
                    <Card key={document.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <input
                          aria-label={`Select ${document.title}`}
                          type="checkbox"
                          checked={selectedDocumentIds.includes(document.id)}
                          disabled={document.status !== "ready"}
                          onChange={() => toggleDocument(document.id)}
                          className="mt-1 h-4 w-4 rounded border-border accent-[var(--primary)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {document.title}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {document.source_type.toUpperCase()}
                            </Badge>
                            <StatusBadge status={document.status} />
                            <span className="text-xs text-muted-foreground">
                              {document.chunk_count} chunks
                            </span>
                          </div>
                          {document.error_message ? (
                            <p className="mt-2 text-xs text-destructive">
                              {document.error_message}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={`Delete ${document.title}`}
                          disabled={deletingId === document.id}
                          onClick={() => void handleDelete(document.id)}
                        >
                          {deletingId === document.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-border px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Ask your documents
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedDocumentIds.length > 0
                    ? `${selectedDocumentIds.length} selected`
                    : "All ready documents"}
                </p>
              </div>
              <Badge variant="secondary">
                Gemini · Supabase pgvector
              </Badge>
            </div>
          </header>

          <div className="flex flex-1 flex-col p-5">
            <form onSubmit={handleAsk} className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask a question about the indexed documents"
                  className="min-h-24 pl-10 pr-28"
                  disabled={asking}
                />
                <Button
                  type="submit"
                  className="absolute bottom-3 right-3"
                  disabled={
                    asking || readyDocuments.length === 0 || !question.trim()
                  }
                >
                  {asking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Ask
                </Button>
              </div>
            </form>

            {notice || error ? (
              <div className="mt-4">
                {notice ? (
                  <InlineMessage tone="success" message={notice} />
                ) : null}
                {error ? <InlineMessage tone="error" message={error} /> : null}
              </div>
            ) : null}

            <ScrollArea className="mt-5 flex-1 pr-3">
              <div className="space-y-4">
                {asking ? (
                  <div className="rounded-lg border border-border bg-card/50 p-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Retrieving context and drafting an answer
                    </div>
                  </div>
                ) : null}

                {turns.length === 0 && !asking ? (
                  <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                    <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">No questions yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Indexed answers will appear here.
                    </p>
                  </div>
                ) : null}

                {turns.map((turn) => (
                  <article
                    key={turn.id}
                    className="rounded-lg border border-border bg-card/40 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{turn.question}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {turn.answer}
                        </p>
                      </div>
                    </div>

                    {turn.citations.length > 0 ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {turn.citations.map((citation) => (
                          <div
                            key={citation.chunkId}
                            className="rounded-md border border-border bg-background/50 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Quote className="h-4 w-4 text-accent" />
                                  <span className="text-sm font-medium">
                                    [{citation.index}] {citation.documentTitle}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {citation.pageNumber
                                    ? `Page ${citation.pageNumber}`
                                    : "Text source"}{" "}
                                  · {formatSimilarity(citation.similarity)}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 max-h-28 overflow-hidden text-xs leading-5 text-muted-foreground">
                              {citation.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </ScrollArea>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: DocumentItem["status"] }) {
  if (status === "ready") {
    return <Badge>Ready</Badge>;
  }

  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  return <Badge variant="secondary">Indexing</Badge>;
}

function InlineMessage({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <Icon
        className={
          tone === "success"
            ? "h-4 w-4 text-primary"
            : "h-4 w-4 text-destructive"
        }
      />
      <span className={tone === "error" ? "text-destructive" : undefined}>
        {message}
      </span>
    </div>
  );
}

function DocumentState({
  icon: Icon,
  text,
  spin = false,
}: {
  icon: typeof FileText;
  text: string;
  spin?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
      <Icon className={spin ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {text}
    </div>
  );
}

async function readPayload<T = unknown>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function getClientError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}
