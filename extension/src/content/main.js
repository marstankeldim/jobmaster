(function attachMain(globalScope) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "jobmaster:analyze-page") {
      try {
        sendResponse({
          ok: true,
          analysis: globalScope.JobmasterAutofill.analyzeCurrentPage(message.context || {})
        });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (message?.action === "jobmaster:autofill") {
      globalScope.JobmasterAutofill
        .runAutofill(message.context)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message?.action === "jobmaster:preview-autofill") {
      try {
        sendResponse({
          ok: true,
          result: globalScope.JobmasterAutofill.previewAutofill(message.context)
        });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (message?.action === "jobmaster:open-assistant") {
      globalScope.JobmasterAssistant
        .open()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }

    if (message?.action === "jobmaster:hide-assistant") {
      globalScope.JobmasterAssistant?.close();
      sendResponse({ ok: true });
      return;
    }
  });
})(globalThis);
