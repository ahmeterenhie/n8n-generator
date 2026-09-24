"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "tr" | "en";
export const LANG_COOKIE = "lang";

const en = {
  nav: {
    home: "Home",
    generator: "Generator",
    settings: "API",
    login: "Sign in",
    logout: "Sign out",
    openApp: "Open app",
  },
  landing: {
    badge: "AI-powered workflow builder",
    titleA: "Describe it.",
    titleB: "Get an n8n workflow.",
    subtitle:
      "Write your automation in plain language. n8n Forge turns it into workflow JSON you can import into n8n in seconds.",
    cta: "Get started",
    secondary: "How it works",
    stepsTitle: "How it works",
    steps: [
      { title: "Connect your API", body: "Add your OpenAI key and pick a model, e.g. a Codex model. The key stays in your browser." },
      { title: "Describe the automation", body: "\"Every morning at 9, pull new orders and post a summary to Slack.\" That's enough." },
      { title: "Import into n8n", body: "Download the JSON, import it in n8n, add credentials, and run it." },
    ],
    featuresTitle: "What you get",
    features: [
      { title: "21 node types", body: "Webhook, Schedule, IF, Code, HTTP, Google Sheets, Gmail, Slack, Airtable, Postgres and more." },
      { title: "Validated output", body: "Every response is checked before you see it, so broken JSON never reaches you." },
      { title: "Your key, your browser", body: "The API key is stored only in this browser and sent only when you generate." },
    ],
    footer: "n8n Forge · review generated workflows before using them in production",
  },
  login: {
    title: "Sign in",
    subtitle: "Sign in to use the workflow generator.",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in...",
    invalid: "Wrong username or password.",
    defaultsHint: "Default credentials are active: admin / admin. Set AUTH_USERNAME and AUTH_PASSWORD in .env.local to change them.",
    back: "← Back to home",
  },
  settings: {
    title: "API connection",
    subtitle: "Connect your OpenAI account to generate workflows. Codex models are supported.",
    apiKey: "OpenAI API key",
    apiKeyHelp: "Create one at platform.openai.com → API keys. It starts with sk-.",
    show: "Show",
    hide: "Hide",
    model: "Model",
    modelHelp: "Codex models are tuned for code and structured output. Pick \"Custom\" to type any model name.",
    custom: "Custom",
    customPlaceholder: "e.g. gpt-5-codex",
    test: "Test connection",
    testing: "Testing...",
    save: "Save",
    saved: "Saved",
    remove: "Remove key",
    status: "Status",
    connected: "Key saved",
    notConnected: "Not connected",
    testOk: "Connection works. Model is available:",
    storageNote: "The key is stored only in this browser (localStorage). It is sent to this app's server only when you generate or test, and never saved there.",
    goGenerate: "Go to generator →",
  },
  generator: {
    title: "Prompt →",
    titleAccent: "n8n Workflow",
    subtitle: "Describe your automation in plain language. Get importable n8n workflow JSON.",
    fileLabel: "DESCRIBE_YOUR_WORKFLOW.txt",
    placeholder: "e.g. Trigger via webhook, extract the email field, look it up in Airtable, and send a personalized reply via Gmail...",
    shortcut: "⌘ + Enter to generate",
    generate: "GENERATE",
    generating: "GENERATING...",
    tryExample: "— try an example",
    examples: [
      "Webhook trigger → parse JSON body → send a Slack message with the data",
      "Every day at 9am, fetch top 10 posts from Reddit API and save titles to Google Sheets",
      "When a form is submitted via webhook, validate the email field, then add the contact to Airtable and send a confirmation email via Gmail",
    ],
    loadingTitle: "Parsing intent...",
    loadingSteps: ["Identifying trigger nodes", "Mapping action nodes", "Wiring connections", "Validating JSON schema"],
    resultLabel: "WORKFLOW_GENERATED.json",
    copy: "COPY",
    copied: "✓ COPIED",
    download: "↓ DOWNLOAD",
    nodes: "nodes",
    connections: "connections",
    bytes: "bytes",
    howToImport: "— how to import",
    importSteps: ["Download the .json file", "Open n8n → Workflows → Import from File", "Select the downloaded file", "Configure credentials for each node"],
    error: "ERROR:",
    noKeyBanner: "No API key connected yet.",
    noKeyLink: "Connect API →",
    modelChip: "model",
    viewDiagram: "DIAGRAM",
    viewJson: "JSON",
  },
  diagram: {
    true: "true",
    false: "false",
    done: "done",
    loop: "loop",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Fit to width",
    parameters: "Parameters",
    noParams: "This node has no parameters.",
    clickHint: "Click a node to see its settings.",
    missing: "Connections point to nodes that don't exist:",
    empty: "This workflow has no nodes to draw.",
    categories: {
      trigger: "Trigger",
      logic: "Logic",
      data: "Data",
      http: "HTTP",
      app: "Apps",
      db: "Database",
      other: "Other",
    },
  },
  errors: {
    MISSING_KEY: "No OpenAI API key found. Add one on the API page.",
    INVALID_PROMPT: "Please enter a description (max 1000 characters).",
    UNAUTHORIZED: "Your session has ended. Please sign in again.",
    INVALID_KEY: "OpenAI rejected the API key. Check it on the API page.",
    MODEL_NOT_FOUND: "This model is not available for your key. Pick another model on the API page.",
    UPSTREAM: "OpenAI request failed:",
    VALIDATION: "The model returned an invalid workflow:",
    SERVER: "Server error",
  },
};

export type Dict = typeof en;

const tr: Dict = {
  nav: {
    home: "Ana sayfa",
    generator: "Üretici",
    settings: "API",
    login: "Giriş yap",
    logout: "Çıkış yap",
    openApp: "Uygulamayı aç",
  },
  landing: {
    badge: "Yapay zekâ destekli iş akışı üretici",
    titleA: "Anlat.",
    titleB: "n8n iş akışın hazır olsun.",
    subtitle:
      "Otomasyonunu düz bir dille yaz. n8n Forge bunu saniyeler içinde n8n'e aktarabileceğin iş akışı JSON'una çevirir.",
    cta: "Başla",
    secondary: "Nasıl çalışır?",
    stepsTitle: "Nasıl çalışır?",
    steps: [
      { title: "API'ni bağla", body: "OpenAI anahtarını ekle ve bir model seç, örneğin bir Codex modeli. Anahtar tarayıcında kalır." },
      { title: "Otomasyonu anlat", body: "\"Her sabah 9'da yeni siparişleri çek ve özetini Slack'e gönder.\" Bu kadarı yeterli." },
      { title: "n8n'e aktar", body: "JSON'u indir, n8n'e aktar, bağlantı bilgilerini gir ve çalıştır." },
    ],
    featuresTitle: "Neler var?",
    features: [
      { title: "21 düğüm tipi", body: "Webhook, Zamanlayıcı, IF, Code, HTTP, Google Sheets, Gmail, Slack, Airtable, Postgres ve fazlası." },
      { title: "Doğrulanmış çıktı", body: "Her cevap sana gösterilmeden önce kontrol edilir; bozuk JSON eline ulaşmaz." },
      { title: "Anahtar senin tarayıcında", body: "API anahtarı yalnızca bu tarayıcıda saklanır, sadece üretim sırasında gönderilir." },
    ],
    footer: "n8n Forge · üretilen iş akışlarını canlıya almadan önce gözden geçir",
  },
  login: {
    title: "Giriş yap",
    subtitle: "İş akışı üreticiyi kullanmak için giriş yap.",
    username: "Kullanıcı adı",
    password: "Şifre",
    submit: "Giriş yap",
    submitting: "Giriş yapılıyor...",
    invalid: "Kullanıcı adı veya şifre hatalı.",
    defaultsHint: "Varsayılan giriş bilgileri etkin: admin / admin. Değiştirmek için .env.local dosyasına AUTH_USERNAME ve AUTH_PASSWORD ekle.",
    back: "← Ana sayfaya dön",
  },
  settings: {
    title: "API bağlantısı",
    subtitle: "İş akışı üretmek için OpenAI hesabını bağla. Codex modelleri desteklenir.",
    apiKey: "OpenAI API anahtarı",
    apiKeyHelp: "platform.openai.com → API keys bölümünden oluşturabilirsin. sk- ile başlar.",
    show: "Göster",
    hide: "Gizle",
    model: "Model",
    modelHelp: "Codex modelleri kod ve yapılandırılmış çıktı için ayarlanmıştır. Başka bir model adı yazmak için \"Özel\"i seç.",
    custom: "Özel",
    customPlaceholder: "örn. gpt-5-codex",
    test: "Bağlantıyı test et",
    testing: "Test ediliyor...",
    save: "Kaydet",
    saved: "Kaydedildi",
    remove: "Anahtarı sil",
    status: "Durum",
    connected: "Anahtar kayıtlı",
    notConnected: "Bağlı değil",
    testOk: "Bağlantı çalışıyor. Model erişilebilir:",
    storageNote: "Anahtar yalnızca bu tarayıcıda (localStorage) saklanır. Sadece üretim veya test sırasında bu uygulamanın sunucusuna gönderilir, orada kaydedilmez.",
    goGenerate: "Üreticiye git →",
  },
  generator: {
    title: "Tarif →",
    titleAccent: "n8n İş Akışı",
    subtitle: "Otomasyonunu düz bir dille anlat. n8n'e aktarılabilir iş akışı JSON'u al.",
    fileLabel: "IS_AKISINI_ANLAT.txt",
    placeholder: "örn. Webhook ile tetikle, e-posta alanını al, Airtable'da ara ve Gmail ile kişiye özel bir cevap gönder...",
    shortcut: "⌘ + Enter ile üret",
    generate: "ÜRET",
    generating: "ÜRETİLİYOR...",
    tryExample: "— bir örnek dene",
    examples: [
      "Webhook tetikleyici → JSON gövdesini ayrıştır → verileri Slack mesajı olarak gönder",
      "Her gün sabah 9'da Reddit API'den en popüler 10 gönderiyi çek ve başlıklarını Google Sheets'e kaydet",
      "Webhook ile form gönderildiğinde e-posta alanını doğrula, kişiyi Airtable'a ekle ve Gmail ile onay e-postası gönder",
    ],
    loadingTitle: "İstek çözümleniyor...",
    loadingSteps: ["Tetikleyici düğümler belirleniyor", "Eylem düğümleri eşleniyor", "Bağlantılar kuruluyor", "JSON şeması doğrulanıyor"],
    resultLabel: "IS_AKISI_HAZIR.json",
    copy: "KOPYALA",
    copied: "✓ KOPYALANDI",
    download: "↓ İNDİR",
    nodes: "düğüm",
    connections: "bağlantı",
    bytes: "bayt",
    howToImport: "— nasıl aktarılır",
    importSteps: ["JSON dosyasını indir", "n8n → Workflows → Import from File menüsünü aç", "İndirdiğin dosyayı seç", "Her düğüm için bağlantı bilgilerini (credentials) gir"],
    error: "HATA:",
    noKeyBanner: "Henüz bir API anahtarı bağlanmadı.",
    noKeyLink: "API bağla →",
    modelChip: "model",
    viewDiagram: "ŞEMA",
    viewJson: "JSON",
  },
  diagram: {
    true: "doğru",
    false: "yanlış",
    done: "bitti",
    loop: "döngü",
    zoomIn: "Yakınlaştır",
    zoomOut: "Uzaklaştır",
    fit: "Genişliğe sığdır",
    parameters: "Parametreler",
    noParams: "Bu düğümün parametresi yok.",
    clickHint: "Ayarlarını görmek için bir düğüme tıkla.",
    missing: "Bağlantılar, var olmayan düğümlere işaret ediyor:",
    empty: "Bu iş akışında çizilecek düğüm yok.",
    categories: {
      trigger: "Tetikleyici",
      logic: "Mantık",
      data: "Veri",
      http: "HTTP",
      app: "Uygulama",
      db: "Veritabanı",
      other: "Diğer",
    },
  },
  errors: {
    MISSING_KEY: "OpenAI API anahtarı bulunamadı. API sayfasından ekleyin.",
    INVALID_PROMPT: "Lütfen bir açıklama girin (en fazla 1000 karakter).",
    UNAUTHORIZED: "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.",
    INVALID_KEY: "OpenAI API anahtarını reddetti. API sayfasından kontrol edin.",
    MODEL_NOT_FOUND: "Bu model anahtarınız için kullanılamıyor. API sayfasından başka bir model seçin.",
    UPSTREAM: "OpenAI isteği başarısız oldu:",
    VALIDATION: "Model geçersiz bir iş akışı döndürdü:",
    SERVER: "Sunucu hatası",
  },
};

export const dictionaries: Record<Lang, Dict> = { en, tr };

type ErrorCode = keyof Dict["errors"];

/** Turns an API error payload `{ code, error }` into a message in the current language. */
export function translateError(t: Dict, data: { code?: string; error?: string }, status: number): string {
  const code = data.code as ErrorCode | undefined;
  if (code && code in t.errors) {
    const base = t.errors[code];
    // These codes are prefixes: append the upstream detail
    return code === "UPSTREAM" || code === "VALIDATION" ? `${base} ${data.error ?? ""}`.trim() : base;
  }
  return data.error || `${t.errors.SERVER}: ${status}`;
}

const I18nContext = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void } | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    // Cookie so the server renders the right language on the next load (no flash)
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <I18nContext.Provider value={{ lang, t: dictionaries[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
