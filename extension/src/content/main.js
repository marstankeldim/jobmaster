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
  });
})(globalThis);
