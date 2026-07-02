"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Quote,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { cn, formatBytes } from "@/lib/utils";

const SESSION_STORAGE_KEY = "answerdocs.sessionId";
const PASTED_CONTEXT_MIN_CHARACTERS = 350;
const PASTED_CONTEXT_MIN_LINES = 3;
const PASTED_PDF_ERROR =
  "Could not process the pasted PDF. Try uploading it or dragging it into the chat.";

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
  chunkIndex: number;
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
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatFormRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
  const [uploadingChatAttachment, setUploadingChatAttachment] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draggingChatFile, setDraggingChatFile] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );
  const isInitialChat = turns.length === 0 && !asking;
  const canSubmitQuestion =
    Boolean(sessionId) &&
    !asking &&
    !uploadingChatAttachment &&
    question.trim().length > 0;

  async function loadDocuments(currentSessionId: string) {
    try {
      const response = await fetch(
        `/api/documents?sessionId=${encodeURIComponent(currentSessionId)}`,
        { cache: "no-store" },
      );
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
      let nextSessionId = crypto.randomUUID();

      try {
        const storedSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        nextSessionId = storedSessionId || nextSessionId;

        if (!storedSessionId) {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
        }
      } catch {
        // Private browsing or strict storage settings can block sessionStorage.
      }

      setSessionId(nextSessionId);
      setSessionReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setTimeout(() => {
      setSelectedDocumentIds([]);
      void loadDocuments(sessionId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [asking, turns.length]);

  async function indexDocument(input: {
    file?: File;
    text?: string;
    title?: string;
  }) {
    if (!sessionId) {
      throw new Error("The chat session is not ready yet.");
    }

    const formData = new FormData();
    formData.append("sessionId", sessionId);
    if (input.title?.trim()) formData.append("title", input.title.trim());
    if (input.file) formData.append("file", input.file);
    if (input.text?.trim()) formData.append("text", input.text.trim());

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });
    const payload = await readPayload<{ document: DocumentItem }>(response);

    setDocuments((current) => [payload.document, ...current]);
    setSelectedDocumentIds((current) =>
      current.includes(payload.document.id)
        ? current
        : [...current, payload.document.id],
    );

    return payload.document;
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUploading(true);

    try {
      let uploadedDocument: DocumentItem;
      if (uploadMode === "file") {
        if (!file) throw new Error("Choose a PDF or .txt file.");
        uploadedDocument = await indexDocument({ file, title });
      } else {
        if (!pastedText.trim()) throw new Error("Paste text before indexing.");
        uploadedDocument = await indexDocument({ text: pastedText, title });
      }

      setNotice(`Indexed "${uploadedDocument.title}".`);
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
      if (!sessionId) throw new Error("The chat session is not ready yet.");
      const response = await fetch(
        `/api/documents/${documentId}?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
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
    if (!nextQuestion || asking || uploadingChatAttachment || !sessionId) return;

    setAsking(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
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
        ...current,
        {
          id: crypto.randomUUID(),
          question: nextQuestion,
          answer: payload.answer,
          citations: payload.citations,
        },
      ]);
      setQuestion("");
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setAsking(false);
    }
  }

  async function handleChatPdfFile(nextFile: File) {
    setError(null);
    setNotice(null);

    if (!isPdfFile(nextFile)) {
      setError("Attach a PDF file.");
      return;
    }

    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        file: nextFile,
        title: nextFile.name,
      });
      setNotice(`Added "${uploadedDocument.title}" to this chat.`);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  async function handlePastedChatContext(text: string) {
    setError(null);
    setNotice(null);
    setUploadingChatAttachment(true);

    try {
      const uploadedDocument = await indexDocument({
        text,
        title: "Pasted chat context",
      });
      setNotice(`Added "${uploadedDocument.title}" to this chat.`);
    } catch (requestError) {
      setError(getClientError(requestError));
    } finally {
      setUploadingChatAttachment(false);
    }
  }

  function handleQuestionPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (uploadingChatAttachment) return;

    const pastedFile = getPastedPdfFile(event.clipboardData);
    if (pastedFile.file) {
      event.preventDefault();
      void handleChatPdfFile(pastedFile.file);
      return;
    }

    if (pastedFile.inaccessibleFile) {
      event.preventDefault();
      setNotice(null);
      setError(PASTED_PDF_ERROR);
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (!shouldTreatPasteAsContext(text)) return;

    event.preventDefault();
    void handlePastedChatContext(text);
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (canSubmitQuestion) {
      chatFormRef.current?.requestSubmit();
    }
  }

  function handleChatDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(true);
  }

  function handleChatDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(true);
  }

  function handleChatDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDraggingChatFile(false);
  }

  function handleChatDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingChatFile(false);

    const nextFile = [...event.dataTransfer.files].find(isPdfFile);
    if (!nextFile) {
      setError("Drop a PDF file.");
      return;
    }

    void handleChatPdfFile(nextFile);
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  if (!sessionReady) {
    return (
      <main className="min-h-dvh bg-background text-foreground lg:h-dvh">
        <div className="grid min-h-dvh w-full gap-0 lg:h-dvh lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-border/80 bg-card/80 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
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
              <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-dashed border-border/90 bg-card/70 px-3 py-4 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing chat session
              </div>
            </div>
          </aside>
          <section className="flex min-h-[60dvh] items-center justify-center p-5 lg:min-h-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
              Preparing workspace
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          "grid h-dvh w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-out lg:grid-rows-none",
          isSidebarCollapsed
            ? "lg:grid-cols-[72px_minmax(0,1fr)]"
            : "lg:grid-cols-[380px_minmax(0,1fr)]",
        )}
      >
        <aside className="max-h-[32dvh] min-w-0 overflow-y-auto border-b border-border/80 bg-card/80 shadow-[var(--shadow-subtle)] lg:max-h-none lg:overflow-hidden lg:border-b-0 lg:border-r lg:shadow-none">
          <div
            className={cn(
              "flex h-full min-h-0 flex-col p-5 transition-all duration-300 ease-out",
              isSidebarCollapsed && "p-3",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-3",
                isSidebarCollapsed && "lg:flex-col",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105">
                <Sparkles className="h-5 w-5" />
              </div>
              {!isSidebarCollapsed ? (
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">
                    AnswerDocs
                  </h1>
                  <p className="text-sm text-muted-foreground">RAG workspace</p>
                </div>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("ml-auto", isSidebarCollapsed && "lg:ml-0")}
                aria-label={
                  isSidebarCollapsed
                    ? "Expand document menu"
                    : "Collapse document menu"
                }
                aria-expanded={!isSidebarCollapsed}
                title={
                  isSidebarCollapsed
                    ? "Expand document menu"
                    : "Collapse document menu"
                }
                onClick={() => setIsSidebarCollapsed((current) => !current)}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </div>

            {isSidebarCollapsed ? (
              <div className="mt-3 flex items-center gap-2 lg:mt-5 lg:flex-col">
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  <span>{readyDocuments.length}</span>
                  <span className="lg:hidden">ready</span>
                </Badge>
                {selectedDocumentIds.length > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <span>{selectedDocumentIds.length}</span>
                    <span className="lg:hidden">selected</span>
                  </Badge>
                ) : null}
              </div>
            ) : (
              <>
                <Separator className="my-5" />

                <form onSubmit={handleUpload} className="animate-panel-in space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Documents</h2>
                    <Badge variant="secondary">
                      {readyDocuments.length} ready
                    </Badge>
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
                        disabled={uploading || !sessionId}
                      />
                    </div>

                    <TabsContent value="file">
                      <div className="space-y-2">
                        <Label htmlFor="document-file">File</Label>
                        <Input
                          id="document-file"
                          type="file"
                          accept="application/pdf,text/plain,.pdf,.txt"
                          disabled={uploading || !sessionId}
                          onChange={(event) =>
                            setFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {file
                            ? `${file.name} - ${formatBytes(file.size)}`
                            : "PDF or .txt, up to 10 MB"}
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
                          disabled={uploading || !sessionId}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>

                  {uploading ? <Progress value={66} /> : null}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={uploading || !sessionId}
                  >
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

                <ScrollArea className="mt-3 min-h-0 flex-1 pr-3">
                  <div className="space-y-2">
                    {loadingDocuments ? (
                      <DocumentState
                        icon={Loader2}
                        text="Loading documents"
                        spin
                      />
                    ) : documents.length === 0 ? (
                      <DocumentState
                        icon={FileText}
                        text="No documents indexed"
                      />
                    ) : (
                      documents.map((document) => (
                        <Card
                          key={document.id}
                          className="p-3 shadow-none hover:-translate-y-0.5 hover:shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <input
                              aria-label={`Select ${document.title}`}
                              type="checkbox"
                              checked={selectedDocumentIds.includes(
                                document.id,
                              )}
                              disabled={document.status !== "ready"}
                              onChange={() => toggleDocument(document.id)}
                              className="mt-1 h-4 w-4 rounded border-border accent-[var(--accent)] transition-transform duration-200 checked:scale-105"
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
              </>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="border-b border-border/80 bg-background/70 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Ask your documents
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedDocumentIds.length > 0
                    ? `${selectedDocumentIds.length} selected`
                    : readyDocuments.length > 0
                      ? "This chat's ready documents"
                      : "No context loaded yet"}
                </p>
              </div>
              <Badge variant="secondary" className="self-start md:self-auto">
                Gemini - Supabase pgvector
              </Badge>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div
              className={cn(
                "mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col",
                isInitialChat && "justify-center",
              )}
            >
              {notice || error ? (
                <div className="mb-4 shrink-0">
                  {notice ? (
                    <InlineMessage tone="success" message={notice} />
                  ) : null}
                  {error ? <InlineMessage tone="error" message={error} /> : null}
                </div>
              ) : null}

              {isInitialChat ? (
                <div className="animate-panel-in mb-5 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/90 bg-card/70 px-4 py-10 text-center shadow-[var(--shadow-subtle)]">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">No questions yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Indexed answers will appear here.
                  </p>
                </div>
              ) : (
                <ScrollArea className="min-h-0 flex-1 pr-2 sm:pr-3">
                  <div className="flex min-h-full flex-col justify-end gap-4 pb-1">
                    {turns.map((turn) => (
                      <article
                        key={turn.id}
                        className="animate-message-in flex flex-col gap-3"
                      >
                        <div className="ml-auto flex max-w-[86%] items-start gap-2 sm:max-w-[76%]">
                          <div className="min-w-0 rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                            <p className="whitespace-pre-wrap text-sm leading-6">
                              {turn.question}
                            </p>
                          </div>
                        </div>

                        <div className="mr-auto max-w-[94%] rounded-3xl rounded-bl-lg border border-border/80 bg-card/85 p-4 text-card-foreground shadow-[var(--shadow-subtle)] sm:max-w-[86%]">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="whitespace-pre-wrap text-sm leading-6">
                                {turn.answer}
                              </p>
                            </div>
                          </div>

                          {turn.citations.length > 0 ? (
                            <details className="group mt-4 rounded-2xl border border-border/80 bg-background/55 shadow-sm transition-all duration-200 open:bg-background/75">
                              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                <Quote className="h-4 w-4 text-accent-foreground" />
                                View references ({turn.citations.length})
                                <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                              </summary>
                              <div className="references-panel grid gap-3 border-t border-border/80 p-3 md:grid-cols-2">
                                {turn.citations.map((citation) => (
                                  <div
                                    key={citation.chunkId}
                                    className="rounded-2xl border border-border/75 bg-card/70 p-3 shadow-sm"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                                            {citation.index}
                                          </span>
                                          <span className="truncate text-sm font-medium">
                                            {citation.documentTitle}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {citation.pageNumber
                                            ? `Page ${citation.pageNumber} - Block ${citation.chunkIndex + 1}`
                                            : `Text block ${citation.chunkIndex + 1}`}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="mt-3 max-h-28 overflow-hidden text-xs leading-5 text-muted-foreground">
                                      {citation.snippet}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </article>
                    ))}

                    {asking ? (
                      <div className="animate-message-in mr-auto rounded-3xl rounded-bl-lg border border-border/80 bg-card/80 p-4 shadow-[var(--shadow-subtle)]">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
                          Retrieving context and drafting an answer
                        </div>
                      </div>
                    ) : null}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}

              <form
                ref={chatFormRef}
                onSubmit={handleAsk}
                className={cn("shrink-0 space-y-3", !isInitialChat && "mt-4")}
              >
                <section
                  aria-label="Chat composer"
                  onDragEnter={handleChatDragEnter}
                  onDragOver={handleChatDragOver}
                  onDragLeave={handleChatDragLeave}
                  onDrop={handleChatDrop}
                  className={cn(
                    "relative rounded-3xl border border-border/80 bg-card/85 shadow-[var(--shadow-soft)] transition-all duration-200 focus-within:border-ring/80 focus-within:ring-4 focus-within:ring-ring/10",
                    draggingChatFile &&
                      "border-primary bg-secondary shadow-[var(--shadow-soft)]",
                  )}
                >
                  <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    onPaste={handleQuestionPaste}
                    placeholder="Ask about your documents or paste a PDF/text context"
                    className="min-h-32 border-0 bg-transparent pb-16 pl-11 pr-28 shadow-none focus-visible:ring-0"
                    disabled={asking || uploadingChatAttachment || !sessionId}
                  />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shadow-none"
                      title="Attach PDF"
                      disabled={uploadingChatAttachment || !sessionId}
                      onClick={() => chatFileInputRef.current?.click()}
                    >
                      {uploadingChatAttachment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Paperclip className="h-4 w-4" />
                      )}
                      PDF
                    </Button>
                    {uploadingChatAttachment ? (
                      <span className="text-xs text-muted-foreground">
                        Indexing context
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    className="absolute bottom-3 right-3"
                    disabled={!canSubmitQuestion}
                  >
                    {asking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Ask
                  </Button>
                  {draggingChatFile ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-background/85 text-sm font-medium text-foreground backdrop-blur-sm">
                      Drop PDF to add it to this chat
                    </div>
                  ) : null}
                </section>
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (nextFile) void handleChatPdfFile(nextFile);
                  }}
                />
              </form>
            </div>
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
    <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm">
      <Icon
        className={
          tone === "success"
            ? "h-4 w-4 text-accent-foreground"
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
    <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-dashed border-border/90 bg-card/65 px-3 py-4 text-sm text-muted-foreground shadow-sm">
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

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function getPastedPdfFile(clipboardData: DataTransfer) {
  const files = [...clipboardData.files];
  const fileListPdf = files.find(isPdfFile);

  if (fileListPdf) {
    return { file: fileListPdf, inaccessibleFile: false };
  }

  let inaccessibleFile = false;

  for (const item of [...clipboardData.items]) {
    if (item.kind !== "file") continue;

    const file = item.getAsFile();
    if (file && isPdfFile(file)) {
      return { file, inaccessibleFile: false };
    }

    if (!file && isPdfClipboardItem(item)) {
      inaccessibleFile = true;
    }
  }

  return { file: null, inaccessibleFile };
}

function isPdfClipboardItem(item: DataTransferItem) {
  return item.type === "application/pdf" || item.type === "";
}

function shouldTreatPasteAsContext(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const lineCount = trimmed.split(/\r?\n/).filter((line) => line.trim()).length;
  return (
    trimmed.length >= PASTED_CONTEXT_MIN_CHARACTERS ||
    lineCount >= PASTED_CONTEXT_MIN_LINES
  );
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return [...event.dataTransfer.types].includes("Files");
}
