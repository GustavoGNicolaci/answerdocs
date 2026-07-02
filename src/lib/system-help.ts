import type { ResponseLanguage } from "@/lib/types";

const SYSTEM_NAME_PATTERN =
  /\b(answerdocs|this app|the app|this chat|the chat|system|workspace|este app|o app|este chat|o chat|sistema|ambiente)\b/;

export function getSystemHelpAnswer(question: string, language: ResponseLanguage) {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return null;

  if (asksAboutUploading(normalized)) {
    return language === "pt"
      ? "Você pode adicionar contexto enviando um PDF ou arquivo .txt pelo painel de documentos, arrastando um PDF para o chat, colando um PDF no chat ou colando um texto maior diretamente no chat."
      : "You can add context by uploading a PDF or .txt file from the document panel, dragging a PDF into the chat, pasting a PDF into the chat, or pasting longer text directly into the chat.";
  }

  if (asksAboutCitations(normalized)) {
    return language === "pt"
      ? "Quando há contexto documental disponível, o AnswerDocs responde apenas com base nos trechos recuperados e mostra até três referências com nome do arquivo, página ou bloco de texto e o trecho usado."
      : "When document context is available, AnswerDocs answers only from retrieved snippets and shows up to three references with the file name, page or text block, and the supporting snippet.";
  }

  if (asksAboutScope(normalized)) {
    return language === "pt"
      ? "Este chat usa apenas documentos prontos selecionados e contexto colado na sessão atual desta aba. Documentos disponíveis, mas não selecionados, não são usados."
      : "This chat uses only selected ready documents and pasted context from the current browser-tab session. Documents that are available but not selected are not used.";
  }

  if (asksAboutPurpose(normalized)) {
    return language === "pt"
      ? "O AnswerDocs é um workspace RAG para fazer perguntas fundamentadas sobre PDFs enviados, arquivos de texto e contexto colado no chat."
      : "AnswerDocs is a RAG workspace for asking grounded questions over uploaded PDFs, text files, and pasted chat context.";
  }

  return null;
}

function asksAboutUploading(question: string) {
  return (
    /\b(how|can|where|what)\b.*\b(upload|attach|send|add|paste|drag|drop)\b/.test(
      question,
    ) ||
    /\b(como|posso|onde|qual|quais)\b.*\b(enviar|adicionar|colar|arrastar|soltar|upload|anexar)\b/.test(
      question,
    ) ||
    /\b(upload|attach|send|add|paste|drag|drop)\b.*\b(pdf|file|document|text|context)\b/.test(
      question,
    ) ||
    /\b(enviar|adicionar|colar|arrastar|soltar|upload|anexar)\b.*\b(pdf|arquivo|documento|texto|contexto)\b/.test(
      question,
    ) ||
    /\b(supported|allowed)\b.*\b(file|files|format|formats)\b/.test(
      question,
    ) ||
    /\b(suportado|suportados|permitido|permitidos)\b.*\b(arquivo|arquivos|formato|formatos)\b/.test(
      question,
    )
  );
}

function asksAboutCitations(question: string) {
  return (
    SYSTEM_NAME_PATTERN.test(question) &&
    /\b(reference|references|citation|citations|source|sources|referencia|referencias|citação|citações|fonte|fontes)\b/.test(
      question,
    )
  );
}

function asksAboutScope(question: string) {
  return (
    SYSTEM_NAME_PATTERN.test(question) &&
    /\b(scope|context|session|selected|selection|documents|files|use|uses|escopo|contexto|sessão|selecionado|selecionados|seleção|documentos|arquivos|usa|usar)\b/.test(
      question,
    )
  );
}

function asksAboutPurpose(question: string) {
  return (
    /\bwhat\b.*\b(answerdocs|this app|the app)\b/.test(question) ||
    /\b(o que|que)\b.*\b(answerdocs|este app|o app)\b/.test(question) ||
    /\bwhat can you do\b/.test(question) ||
    /\bo que você consegue fazer\b/.test(question) ||
    /\bhow\b.*\b(answerdocs|this app|the app|this chat)\b.*\b(work|works)\b/.test(
      question,
    ) ||
    /\bcomo\b.*\b(answerdocs|este app|o app|este chat|o chat)\b.*\b(funciona|funcionam)\b/.test(
      question,
    )
  );
}
