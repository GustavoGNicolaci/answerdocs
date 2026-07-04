import type { ResponseLanguage } from "@/lib/types";

const SYSTEM_NAME_PATTERN =
  /\b(answerdocs|this app|the app|this chat|the chat|system|workspace|este app|o app|este chat|o chat|sistema|ambiente)\b/;

export function getSystemHelpAnswer(
  question: string,
  language: ResponseLanguage,
) {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return null;

  if (asksAboutUploading(normalized)) {
    return language === "pt"
      ? "Voc\u00ea pode adicionar contexto enviando PDF, imagem ou arquivo .txt pelo painel de documentos, arrastando um documento para o chat, colando um arquivo no chat ou colando um texto maior diretamente no chat."
      : "You can add context by uploading a PDF, image, or .txt file from the document panel, dragging a document into the chat, pasting a file into the chat, or pasting longer text directly into the chat.";
  }

  if (asksAboutCitations(normalized)) {
    return language === "pt"
      ? "Quando h\u00e1 contexto documental dispon\u00edvel, o AnswerDocs responde apenas com base nos trechos recuperados e mostra at\u00e9 tr\u00eas refer\u00eancias com nome do arquivo, p\u00e1gina ou bloco de texto e o trecho usado."
      : "When document context is available, AnswerDocs answers only from retrieved snippets and shows up to three references with the file name, page or text block, and the supporting snippet.";
  }

  if (asksAboutScope(normalized)) {
    return language === "pt"
      ? "Este chat usa apenas documentos prontos selecionados da pasta atual e contexto colado na sess\u00e3o atual desta aba. Documentos dispon\u00edveis, mas n\u00e3o selecionados, n\u00e3o s\u00e3o usados."
      : "This chat uses only selected ready documents from the current folder and pasted context from the current browser-tab session. Documents that are available but not selected are not used.";
  }

  if (asksAboutPurpose(normalized)) {
    return language === "pt"
      ? "O AnswerDocs \u00e9 um workspace RAG para fazer perguntas fundamentadas sobre PDFs, imagens com texto, arquivos de texto e contexto colado no chat."
      : "AnswerDocs is a RAG workspace for asking grounded questions over uploaded PDFs, images with text, text files, and pasted chat context.";
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
    /\b(upload|attach|send|add|paste|drag|drop)\b.*\b(pdf|image|file|document|text|context)\b/.test(
      question,
    ) ||
    /\b(enviar|adicionar|colar|arrastar|soltar|upload|anexar)\b.*\b(pdf|imagem|foto|print|arquivo|documento|texto|contexto)\b/.test(
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
    /\b(reference|references|citation|citations|source|sources|referencia|referencias|cita\u00e7\u00e3o|cita\u00e7\u00f5es|fonte|fontes)\b/.test(
      question,
    )
  );
}

function asksAboutScope(question: string) {
  return (
    SYSTEM_NAME_PATTERN.test(question) &&
    /\b(scope|context|session|selected|selection|documents|files|use|uses|escopo|contexto|sess\u00e3o|selecionado|selecionados|sele\u00e7\u00e3o|documentos|arquivos|usa|usar)\b/.test(
      question,
    )
  );
}

function asksAboutPurpose(question: string) {
  return (
    /\bwhat\b.*\b(answerdocs|this app|the app)\b/.test(question) ||
    /\b(o que|que)\b.*\b(answerdocs|este app|o app)\b/.test(question) ||
    /\bwhat can you do\b/.test(question) ||
    /\bo que voc\u00ea consegue fazer\b/.test(question) ||
    /\bhow\b.*\b(answerdocs|this app|the app|this chat)\b.*\b(work|works)\b/.test(
      question,
    ) ||
    /\bcomo\b.*\b(answerdocs|este app|o app|este chat|o chat)\b.*\b(funciona|funcionam)\b/.test(
      question,
    )
  );
}
