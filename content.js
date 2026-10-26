(() => {
  if (window.__sentinelPromptLabLoaded) return;
  window.__sentinelPromptLabLoaded = true;

  const text = (node) => (node?.innerText || node?.textContent || "").trim();
  const visible = (node) => {
    if (!node) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const score = (node, kind) => {
    const attrs = [node.getAttribute("aria-label"), node.getAttribute("placeholder"), node.getAttribute("name"), node.id, node.className]
      .filter(Boolean).join(" ").toLowerCase();
    let value = 0;
    if (kind === "input") {
      if (/chat|message|ask|question|prompt|reply|type/.test(attrs)) value += 5;
      if (node.matches("textarea,[contenteditable='true']")) value += 2;
    } else if (/send|submit|ask|reply|go/.test(attrs + " " + text(node).toLowerCase())) {
      value += 4;
    }
    return value;
  };

  function findCandidates() {
    const inputs = [...document.querySelectorAll("textarea, input[type='text'], [contenteditable='true']")]
      .filter(visible).map((node) => ({ node, score: score(node, "input") })).sort((a, b) => b.score - a.score);
    const buttons = [...document.querySelectorAll("button, input[type='submit'], [role='button']")]
      .filter(visible).map((node) => ({ node, score: score(node, "button") })).sort((a, b) => b.score - a.score);
    return { inputs, buttons };
  }

  function describe() {
    const { inputs, buttons } = findCandidates();
    const input = inputs[0]?.node;
    const button = buttons[0]?.node;
    return {
      detected: Boolean(input && (inputs[0].score >= 2 || buttons[0]?.score >= 4)),
      confidence: Math.min(100, (inputs[0]?.score || 0) * 12 + (buttons[0]?.score || 0) * 10),
      input: input ? { tag: input.tagName, label: input.getAttribute("aria-label") || input.getAttribute("placeholder") || "" } : null,
      button: button ? { tag: button.tagName, label: button.getAttribute("aria-label") || button.getAttribute("title") || text(button).slice(0, 60) } : null,
      url: location.href,
      title: document.title
    };
  }

  function setValue(node, value) {
    node.focus();
    if (node.matches("[contenteditable='true']")) {
      node.textContent = value;
    } else {
      const setter = Object.getOwnPropertyDescriptor(node.constructor.prototype, "value")?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(node, value);
      else node.value = value;
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function snapshot() {
    const selectors = [
      "[data-message-author-role='assistant']",
      "[data-role='assistant']",
      ".assistant, .bot, .ai-message, [class*='assistant'], [class*='bot']",
      "[aria-label*='assistant' i], [aria-label*='response' i]"
    ];
    const nodes = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter(visible).map(text).filter(Boolean);
    if (nodes.length) return nodes.slice(-8).join("\n\n");
    const main = document.querySelector("main, [role='main'], article") || document.body;
    return text(main).slice(-6000);
  }

  async function runPrompt(prompt, timeoutMs = 15000) {
    const before = snapshot();
    const { inputs, buttons } = findCandidates();
    const input = inputs[0]?.node;
    if (!input) throw new Error("No chatbot input detected");
    setValue(input, prompt);
    const button = buttons.find((item) => item.score >= 3)?.node || buttons[0]?.node;
    if (!button) throw new Error("No chatbot send button detected");
    button.click();
    const started = Date.now();
    let last = snapshot();
    let stableSince = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const current = snapshot();
      if (current !== last) {
        last = current;
        stableSince = Date.now();
      }
      if (current !== before && Date.now() - stableSince > 1200) break;
    }
    return { before, after: snapshot(), elapsedMs: Date.now() - started };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "detect") {
      sendResponse(describe());
      return true;
    }
    if (message.type === "runPrompt") {
      runPrompt(message.prompt, message.timeoutMs).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "snapshot") {
      sendResponse({ text: snapshot() });
      return true;
    }
    return false;
  });
})();
