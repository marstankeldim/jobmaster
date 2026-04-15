(function attachAutofill(globalScope) {
  const CORE = globalScope.JobmasterAutofillCore;
  const BRIDGE_REQUEST_SOURCE = "jobmaster-bridge-request";
  const BRIDGE_RESPONSE_SOURCE = "jobmaster-bridge-response";
  const FIELD_ATTR = "data-jobmaster-field-id";
  const SCAN_OBSERVER_ATTRIBUTE_FILTER = ["class", "style", "hidden", "aria-hidden", "disabled", "value", "checked"];
  const scanRuntime = {
    observedRoot: null,
    observer: null,
    mutationVersion: 0,
    cachedScan: null,
    markerCounter: 0,
    bridgeCounter: 0,
    bridgePending: new Map()
  };

  function cleanText(value) {
    return CORE.cleanText(value);
  }

  function normalize(value) {
    return CORE.normalize(value);
  }

  function nextFieldId(prefix = "field") {
    scanRuntime.markerCounter += 1;
    return `jm-${prefix}-${scanRuntime.markerCounter}`;
  }

  function isPotentiallyRelevant(element) {
    if (!element || element.disabled || element.hidden) {
      return false;
    }
    if (element.closest("[hidden],[aria-hidden='true']")) {
      return false;
    }
    const type = (element.getAttribute("type") || "").toLowerCase();
    return type !== "hidden";
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function readTextByIds(idList, root = document) {
    return unique(
      String(idList || "")
        .split(/\s+/)
        .map((id) => cleanText(root.getElementById?.(id)?.textContent || document.getElementById(id)?.textContent))
    ).join(" | ");
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function buildLabelIndex(root = document) {
    const index = new Map();
    for (const label of root.querySelectorAll("label")) {
      const text = cleanText(label.innerText || label.textContent);
      if (!text) {
        continue;
      }
      const htmlFor = label.getAttribute("for");
      if (htmlFor) {
        const list = index.get(htmlFor) || [];
        list.push(text);
        index.set(htmlFor, list);
      }
      for (const nestedControl of label.querySelectorAll("input, textarea, select")) {
        const key = nestedControl.id || nestedControl.name;
        if (!key) {
          continue;
        }
        const list = index.get(key) || [];
        list.push(text);
        index.set(key, list);
      }
    }
    return index;
  }

  function nearestHeadingText(element) {
    let current = element;
    while (current && current !== document.body) {
      const labelled = cleanText(current.getAttribute?.("aria-label"));
      if (labelled) {
        return labelled;
      }
      const heading = current.querySelector?.("h1, h2, h3, h4, h5, h6");
      if (heading) {
        return cleanText(heading.textContent);
      }
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          return cleanText(sibling.textContent);
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return "";
  }

  function sectionPathForElement(element) {
    const parts = [];
    const fieldset = element.closest("fieldset");
    if (fieldset) {
      parts.push(cleanText(fieldset.querySelector("legend")?.textContent));
    }
    const section = element.closest("section, article, [role='group'], [aria-labelledby]");
    if (section) {
      const ariaLabelled = readTextByIds(section.getAttribute("aria-labelledby"));
      parts.push(ariaLabelled);
      parts.push(cleanText(section.getAttribute("aria-label")));
    }
    parts.push(nearestHeadingText(element));
    return unique(parts).join(" | ");
  }

  function accessibleNameForElement(element, labelIndex) {
    const names = [];
    const lookupKeys = [element.id, element.name].filter(Boolean);
    for (const key of lookupKeys) {
      if (labelIndex.has(key)) {
        names.push(...labelIndex.get(key));
      }
    }
    if (element.labels) {
      for (const label of element.labels) {
        names.push(cleanText(label.innerText || label.textContent));
      }
    }
    const parentLabel = element.closest("label");
    if (parentLabel) {
      names.push(cleanText(parentLabel.innerText || parentLabel.textContent));
    }
    names.push(readTextByIds(element.getAttribute("aria-labelledby")));
    names.push(cleanText(element.getAttribute("aria-label")));
    names.push(cleanText(element.getAttribute("placeholder")));
    const fieldset = element.closest("fieldset");
    if (fieldset) {
      names.push(cleanText(fieldset.querySelector("legend")?.textContent));
    }
    return unique(names).join(" | ");
  }

  function groupLabelForControls(controls) {
    const labels = unique(
      controls.flatMap((control) => [
        cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent),
        cleanText(control.value),
        cleanText(control.getAttribute("aria-label"))
      ])
    );
    return labels.join(" | ");
  }

  function policyBucketForText(text) {
    const normalized = normalize(text);
    if (
      normalized.includes("equal employment") ||
      normalized.includes("self identify") ||
      normalized.includes("voluntary") ||
      normalized.includes("eeo")
    ) {
      return "eeo";
    }
    return "";
  }

  function markFieldControls(fieldId, controls) {
    for (const control of controls) {
      control.setAttribute(FIELD_ATTR, fieldId);
    }
  }

  function optionListForField(element) {
    if (element.tagName.toLowerCase() !== "select") {
      return [];
    }
    return [...element.options].map((option) => ({
      label: cleanText(option.label || option.textContent),
      value: cleanText(option.value || option.textContent)
    }));
  }

  function optionListForControls(controls, labelIndex) {
    return controls.map((control) => ({
      label:
        cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent) ||
        accessibleNameForElement(control, labelIndex) ||
        cleanText(control.value),
      value: cleanText(control.value)
    }));
  }

  function controlKind(element) {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (tag === "textarea") {
      return "textarea";
    }
    if (type === "file") {
      return "file";
    }
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "radio") {
      return "radio";
    }
    if (tag === "select") {
      return "select";
    }
    return "text";
  }

  function createResolvedField(base) {
    const rawAutocomplete = cleanText(base.rawAutocomplete);
    const parsedAutocomplete = CORE.parseAutocompleteAttribute(rawAutocomplete);
    const signalText = cleanText(
      [
        base.accessibleName,
        base.groupName,
        base.sectionPath,
        base.name,
        base.id,
        base.placeholder,
        rawAutocomplete,
        base.automationId,
        ...(base.options || []).map((option) => option.label)
      ].join(" | ")
    );
    return {
      ...base,
      rawAutocomplete,
      autocompleteTokens: parsedAutocomplete.detailTokens,
      autocompleteRawTokens: parsedAutocomplete.tokens,
      signalText,
      signalTextNormalized: normalize(signalText),
      questionText: cleanText([base.groupName, base.accessibleName, base.sectionPath].filter(Boolean).join(" | ")),
      questionNormalized: normalize([base.groupName, base.accessibleName, base.sectionPath].filter(Boolean).join(" | ")),
      questionTokens: normalize([base.groupName, base.accessibleName, base.sectionPath].filter(Boolean).join(" | "))
        .split(" ")
        .filter(Boolean),
      policyBucket: policyBucketForText([base.groupName, base.sectionPath].join(" | "))
    };
  }

  function createFieldFromElement(element, labelIndex, adapter) {
    const fieldId = element.getAttribute(FIELD_ATTR) || nextFieldId("control");
    markFieldControls(fieldId, [element]);
    const base = {
      fieldId,
      kind: controlKind(element),
      htmlType: (element.getAttribute("type") || "").toLowerCase() || element.tagName.toLowerCase(),
      element,
      controls: [element],
      name: element.getAttribute("name") || "",
      id: element.id || "",
      placeholder: cleanText(element.getAttribute("placeholder")),
      accessibleName: accessibleNameForElement(element, labelIndex),
      groupName: "",
      sectionPath: sectionPathForElement(element),
      rawAutocomplete: element.getAttribute("autocomplete") || "",
      automationId: element.getAttribute("data-automation-id") || element.dataset?.automationId || "",
      options: optionListForField(element)
    };
    const resolved = createResolvedField(base);
    resolved.adapterHints = adapter.classifyField(resolved) || [];
    return resolved;
  }

  function createGroupedField(controls, labelIndex, adapter, kind) {
    const fieldId = controls[0].getAttribute(FIELD_ATTR) || nextFieldId(kind);
    markFieldControls(fieldId, controls);
    const first = controls[0];
    const fieldset = first.closest("fieldset");
    const groupName =
      cleanText(fieldset?.querySelector("legend")?.textContent) ||
      readTextByIds(first.closest("[aria-labelledby]")?.getAttribute("aria-labelledby")) ||
      nearestHeadingText(first);
    const base = {
      fieldId,
      kind,
      htmlType: kind,
      element: first,
      controls,
      name: first.getAttribute("name") || "",
      id: first.id || "",
      placeholder: "",
      accessibleName: groupLabelForControls(controls),
      groupName,
      sectionPath: sectionPathForElement(first),
      rawAutocomplete: first.getAttribute("autocomplete") || "",
      automationId: first.getAttribute("data-automation-id") || first.dataset?.automationId || "",
      options: optionListForControls(controls, labelIndex)
    };
    const resolved = createResolvedField(base);
    resolved.adapterHints = adapter.classifyField(resolved) || [];
    return resolved;
  }

  function collectGenericFields(stepRoot, adapter) {
    const labelIndex = buildLabelIndex(stepRoot);
    const rawControls = [...stepRoot.querySelectorAll("input, textarea, select")];
    const potentialControls = rawControls.filter(isPotentiallyRelevant);
    const visibleControls = potentialControls.filter(isVisible);
    const groupedKeys = new Set();
    const radioAndCheckboxGroups = new Map();

    for (const element of visibleControls) {
      const kind = controlKind(element);
      if (kind !== "radio" && kind !== "checkbox") {
        continue;
      }
      const groupName = element.getAttribute("name") || sectionPathForElement(element) || element.id;
      const key = `${kind}:${groupName}`;
      const list = radioAndCheckboxGroups.get(key) || [];
      list.push(element);
      radioAndCheckboxGroups.set(key, list);
    }

    const fields = [];
    let groupedFieldCount = 0;
    for (const [key, controls] of radioAndCheckboxGroups.entries()) {
      if (controls.length <= 1) {
        continue;
      }
      groupedKeys.add(key);
      groupedFieldCount += 1;
      fields.push(createGroupedField(controls, labelIndex, adapter, key.startsWith("radio:") ? "radio-group" : "checkbox-group"));
    }

    for (const element of visibleControls) {
      const kind = controlKind(element);
      const groupName = element.getAttribute("name") || sectionPathForElement(element) || element.id;
      const key = `${kind}:${groupName}`;
      if (groupedKeys.has(key) && (kind === "radio" || kind === "checkbox")) {
        continue;
      }
      fields.push(createFieldFromElement(element, labelIndex, adapter));
    }

    return {
      fields,
      metrics: {
        fieldCountRaw: rawControls.length,
        fieldCountPotential: potentialControls.length,
        fieldCountVisible: visibleControls.length,
        fieldCountGrouped: groupedFieldCount
      }
    };
  }

  function makeCollectHelpers(adapter) {
    return {
      collectGenericFields: (stepRoot) => collectGenericFields(stepRoot, adapter)
    };
  }

  function resolveScanTarget(autofillSettings = null) {
    const adapter = globalScope.JobmasterPlatforms.detectPlatform(window.location, autofillSettings);
    const rootMatch = globalScope.JobmasterPlatforms.resolveApplicationRoot(adapter, document);
    const stepMatch = globalScope.JobmasterPlatforms.resolveStepRoot(adapter, rootMatch);
    return { adapter, rootMatch, stepMatch };
  }

  function invalidateScanCache() {
    scanRuntime.mutationVersion += 1;
    scanRuntime.cachedScan = null;
  }

  function nodeTouchesRelevantFields(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (node.matches("input, textarea, select, label, fieldset, legend, option, form")) {
      return true;
    }
    return Boolean(node.querySelector?.("input, textarea, select, label"));
  }

  function mutationsAreMeaningful(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type === "childList") {
        return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesRelevantFields);
      }
      return nodeTouchesRelevantFields(mutation.target);
    });
  }

  function ensureScanObserver(root) {
    if (scanRuntime.observedRoot === root && scanRuntime.observer) {
      return;
    }
    if (scanRuntime.observer) {
      scanRuntime.observer.disconnect();
    }
    scanRuntime.observedRoot = root;
    scanRuntime.observer = new MutationObserver((mutations) => {
      if (mutationsAreMeaningful(mutations)) {
        invalidateScanCache();
      }
    });
    scanRuntime.observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: SCAN_OBSERVER_ATTRIBUTE_FILTER
    });
    invalidateScanCache();
  }

  function buildScanSnapshot(scanTarget) {
    const helpers = makeCollectHelpers(scanTarget.adapter);
    const triedScopes = [];

    function collectScope(node, selector) {
      const snapshot = scanTarget.adapter.collectFields(node, helpers);
      triedScopes.push({
        selector,
        fieldCountVisible: snapshot.metrics?.fieldCountVisible ?? 0
      });
      return {
        ...snapshot,
        activeSelector: selector
      };
    }

    let snapshot = collectScope(scanTarget.stepMatch.node, scanTarget.stepMatch.selector);
    if (
      (snapshot.metrics?.fieldCountVisible ?? 0) === 0 &&
      scanTarget.rootMatch.node !== scanTarget.stepMatch.node
    ) {
      snapshot = collectScope(scanTarget.rootMatch.node, scanTarget.rootMatch.selector);
    }
    if (
      (snapshot.metrics?.fieldCountVisible ?? 0) === 0 &&
      scanTarget.rootMatch.node !== document
    ) {
      snapshot = collectScope(document, "document");
    }

    return {
      ...snapshot,
      rootNode: scanTarget.rootMatch.node,
      stepNode:
        snapshot.activeSelector === scanTarget.stepMatch.selector ? scanTarget.stepMatch.node :
        snapshot.activeSelector === scanTarget.rootMatch.selector ? scanTarget.rootMatch.node :
        document,
      rootSelectorUsed: scanTarget.rootMatch.selector,
      stepSelectorUsed: snapshot.activeSelector,
      attemptedScopes: triedScopes,
      submissionState: scanTarget.adapter.detectSubmissionState(document)
    };
  }

  function getScanSnapshot(scanTarget, settingsKey = "") {
    const cached = scanRuntime.cachedScan;
    if (
      cached &&
      cached.rootNode === scanTarget.rootMatch.node &&
      cached.stepNode === scanTarget.stepMatch.node &&
      cached.settingsKey === settingsKey &&
      cached.mutationVersion === scanRuntime.mutationVersion
    ) {
      return { ...cached.snapshot, cacheHit: true };
    }
    const snapshot = buildScanSnapshot(scanTarget);
    scanRuntime.cachedScan = {
      rootNode: scanTarget.rootMatch.node,
      stepNode: scanTarget.stepMatch.node,
      settingsKey,
      mutationVersion: scanRuntime.mutationVersion,
      snapshot
    };
    return { ...snapshot, cacheHit: false };
  }

  function showToast(result) {
    const existing = document.getElementById("jobmaster-toast");
    if (existing) {
      existing.remove();
    }
    const toast = document.createElement("div");
    toast.id = "jobmaster-toast";
    toast.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:20px",
      "z-index:2147483647",
      "max-width:360px",
      "padding:14px 16px",
      "border-radius:18px",
      "background:rgba(18, 35, 33, 0.94)",
      "color:white",
      "box-shadow:0 18px 40px rgba(0,0,0,0.25)",
      "font:13px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    ].join(";");
    toast.innerHTML = `<strong style="display:block;margin-bottom:6px;">Jobmaster autofill</strong>
      Filled ${result.filled.length} fields. ${result.review.length} need review. ${result.skipped.length} were skipped.`;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "", inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    dispatchInputEvents(element);
  }

  function setChecked(element, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    if (descriptor?.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }
    dispatchInputEvents(element);
  }

  async function setResumeFile(input, resumeAsset) {
    if (!resumeAsset?.data) {
      return false;
    }
    const file = new File([resumeAsset.data], resumeAsset.name || "resume.pdf", {
      type: resumeAsset.type || "application/octet-stream",
      lastModified: resumeAsset.lastModified || Date.now()
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    dispatchInputEvents(input);
    return true;
  }

  function chooseSelectOption(answer, field) {
    const normalizedAnswer = normalize(answer);
    for (const option of field.options || []) {
      if (normalize(option.label) === normalizedAnswer || normalize(option.value) === normalizedAnswer) {
        return option.value || option.label;
      }
    }
    for (const option of field.options || []) {
      const optionNormalized = normalize(option.label);
      if (optionNormalized.includes(normalizedAnswer) || normalizedAnswer.includes(optionNormalized)) {
        return option.value || option.label;
      }
    }
    return null;
  }

  function verifyFilledValue(field, expectedAnswer) {
    const normalizedExpected = normalize(expectedAnswer);
    if (field.kind === "file") {
      return Boolean(field.controls[0]?.files?.length);
    }
    if (field.kind === "checkbox") {
      return BOOLEANMatch(field.controls[0].checked, normalizedExpected);
    }
    if (field.kind === "checkbox-group") {
      const expectedTokens = normalizedExpected.split(/[,\n]/).map((token) => token.trim()).filter(Boolean);
      if (!expectedTokens.length) {
        return false;
      }
      return expectedTokens.every((token) =>
        field.controls.some(
          (control) =>
            control.checked &&
            (normalize(control.value) === token || normalize(control.closest("label")?.innerText || "") === token)
        )
      );
    }
    if (field.kind === "radio-group") {
      return field.controls.some((control) => {
        if (!control.checked) {
          return false;
        }
        const controlText = normalize(
          cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent || control.value)
        );
        return controlText === normalizedExpected || controlText.includes(normalizedExpected);
      });
    }
    if (field.kind === "select") {
      return normalize(field.controls[0].value) === normalizedExpected;
    }
    return normalize(field.controls[0].value) === normalizedExpected;
  }

  function BOOLEANMatch(checked, normalizedExpected) {
    if (CORE.BOOLEAN_TRUE.has(normalizedExpected)) {
      return checked === true;
    }
    if (CORE.BOOLEAN_FALSE.has(normalizedExpected)) {
      return checked === false;
    }
    return false;
  }

  function installPageBridge() {
    if (document.getElementById("jobmaster-page-bridge")) {
      return;
    }
    const script = document.createElement("script");
    script.id = "jobmaster-page-bridge";
    script.textContent = `
      (() => {
        if (window.__jobmasterPageBridgeInstalled) {
          return;
        }
        window.__jobmasterPageBridgeInstalled = true;
        const FIELD_ATTR = ${JSON.stringify(FIELD_ATTR)};
        function cleanText(value) {
          return String(value || "").replace(/\\s+/g, " ").trim();
        }
        function normalize(value) {
          return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        }
        function dispatchInputEvents(element) {
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "", inputType: "insertText" }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
        }
        function setValue(element, value) {
          const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
          if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
          } else {
            element.value = value;
          }
          dispatchInputEvents(element);
        }
        function setChecked(element, checked) {
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
          if (descriptor && descriptor.set) {
            descriptor.set.call(element, checked);
          } else {
            element.checked = checked;
          }
          dispatchInputEvents(element);
        }
        function controlsFor(fieldId) {
          return [...document.querySelectorAll("[" + FIELD_ATTR + "='" + CSS.escape(fieldId) + "']")];
        }
        window.addEventListener("message", (event) => {
          if (event.source !== window || event.data?.source !== ${JSON.stringify(BRIDGE_REQUEST_SOURCE)}) {
            return;
          }
          const { requestId, command, payload } = event.data;
          try {
            const controls = controlsFor(payload.fieldId);
            let ok = false;
            if (command === "set-value") {
              if (controls[0]) {
                controls[0].focus();
                setValue(controls[0], payload.value);
                ok = normalize(controls[0].value) === normalize(payload.value);
              }
            } else if (command === "set-checked") {
              if (controls[0]) {
                setChecked(controls[0], Boolean(payload.checked));
                ok = controls[0].checked === Boolean(payload.checked);
              }
            } else if (command === "select-option") {
              if (controls[0]) {
                const element = controls[0];
                const target = [...element.options].find((option) => {
                  const optionText = normalize(option.label || option.textContent || option.value);
                  return optionText === normalize(payload.value) || optionText.includes(normalize(payload.value));
                });
                if (target) {
                  setValue(element, target.value || target.textContent || target.label);
                  ok = normalize(element.value) === normalize(target.value || target.textContent || target.label);
                }
              }
            } else if (command === "choose-group-option") {
              const normalizedValue = normalize(payload.value);
              const target = controls.find((control) => {
                const label = normalize(cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent || control.value));
                return label === normalizedValue || label.includes(normalizedValue) || normalize(control.value) === normalizedValue;
              });
              if (target) {
                setChecked(target, true);
                ok = target.checked === true;
              }
            }
            window.postMessage({ source: ${JSON.stringify(BRIDGE_RESPONSE_SOURCE)}, requestId, ok }, "*");
          } catch (error) {
            window.postMessage({ source: ${JSON.stringify(BRIDGE_RESPONSE_SOURCE)}, requestId, ok: false, error: String(error) }, "*");
          }
        });
      })();
    `;
    (document.documentElement || document.head || document.body).append(script);
    script.remove();
  }

  function bridgeFill(command, payload) {
    installPageBridge();
    const requestId = `jm-bridge-${++scanRuntime.bridgeCounter}`;
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        scanRuntime.bridgePending.delete(requestId);
        resolve({ ok: false, error: "bridge timeout" });
      }, 800);
      scanRuntime.bridgePending.set(requestId, { resolve, timeoutId });
      window.postMessage({ source: BRIDGE_REQUEST_SOURCE, requestId, command, payload }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== BRIDGE_RESPONSE_SOURCE) {
      return;
    }
    const pending = scanRuntime.bridgePending.get(event.data.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    scanRuntime.bridgePending.delete(event.data.requestId);
    pending.resolve({ ok: Boolean(event.data.ok), error: event.data.error || "" });
  });

  async function fillField(field, match, adapter, context) {
    const answer = adapter.normalizeChoice(field, match.selectedAnswer, context);
    if (field.kind === "file") {
      const ok = await setResumeFile(field.controls[0], context.resumeAsset);
      return ok ? { filled: true, method: "content", message: "resume upload" } : { filled: false, skippedReason: "no stored resume" };
    }

    if (field.kind === "select") {
      const option = chooseSelectOption(answer, field);
      if (!option) {
        return { filled: false, skippedReason: "no select option match" };
      }
      setNativeValue(field.controls[0], option);
      if (verifyFilledValue(field, option)) {
        return { filled: true, method: "content", message: match.reason };
      }
      const bridgeResult = await bridgeFill("select-option", { fieldId: field.fieldId, value: answer });
      return bridgeResult.ok && verifyFilledValue(field, option)
        ? { filled: true, method: "page-bridge", message: match.reason }
        : { filled: false, skippedReason: "select value did not persist" };
    }

    if (field.kind === "checkbox") {
      const normalizedAnswer = normalize(answer);
      if (!CORE.BOOLEAN_TRUE.has(normalizedAnswer) && !CORE.BOOLEAN_FALSE.has(normalizedAnswer)) {
        return { filled: false, skippedReason: "checkbox answer ambiguous" };
      }
      const checked = CORE.BOOLEAN_TRUE.has(normalizedAnswer);
      setChecked(field.controls[0], checked);
      if (verifyFilledValue(field, answer)) {
        return { filled: true, method: "content", message: match.reason };
      }
      const bridgeResult = await bridgeFill("set-checked", { fieldId: field.fieldId, checked });
      return bridgeResult.ok && verifyFilledValue(field, answer)
        ? { filled: true, method: "page-bridge", message: match.reason }
        : { filled: false, skippedReason: "checkbox value did not persist" };
    }

    if (field.kind === "radio-group") {
      const localControl = field.controls.find((control) => {
        const label = normalize(cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent || control.value));
        return label === normalize(answer) || label.includes(normalize(answer)) || normalize(control.value) === normalize(answer);
      });
      if (localControl) {
        setChecked(localControl, true);
      }
      if (verifyFilledValue(field, answer)) {
        return { filled: true, method: "content", message: match.reason };
      }
      const bridgeResult = await bridgeFill("choose-group-option", { fieldId: field.fieldId, value: answer });
      return bridgeResult.ok && verifyFilledValue(field, answer)
        ? { filled: true, method: "page-bridge", message: match.reason }
        : { filled: false, skippedReason: "radio option did not persist" };
    }

    if (field.kind === "checkbox-group") {
      const tokens = answer
        .split(/[,\n]/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (!tokens.length) {
        return { filled: false, skippedReason: "checkbox group answer ambiguous" };
      }
      for (const control of field.controls) {
        const label = normalize(cleanText(control.closest("label")?.innerText || control.closest("label")?.textContent || control.value));
        const shouldCheck = tokens.some((token) => label === normalize(token) || label.includes(normalize(token)));
        if (shouldCheck) {
          setChecked(control, true);
        }
      }
      return verifyFilledValue(field, answer)
        ? { filled: true, method: "content", message: match.reason }
        : { filled: false, skippedReason: "checkbox selections did not persist" };
    }

    field.controls[0].focus();
    setNativeValue(field.controls[0], answer);
    if (verifyFilledValue(field, answer)) {
      return { filled: true, method: "content", message: match.reason };
    }
    const bridgeResult = await bridgeFill("set-value", { fieldId: field.fieldId, value: answer });
    return bridgeResult.ok && verifyFilledValue(field, answer)
      ? { filled: true, method: "page-bridge", message: match.reason }
      : { filled: false, skippedReason: "value did not persist" };
  }

  function summarizeScan(session) {
    return {
      platform: session.platform,
      applicationFormDetected: session.metrics.fieldCountVisible > 0,
      rootSelectorUsed: session.root.selector,
      stepSelectorUsed: session.step.selector,
      fieldCountHint: session.metrics.fieldCountVisible,
      submissionState: session.submissionState,
      metrics: session.metrics,
      job: session.job,
      fieldsPreview: session.fields.slice(0, 6).map((field) => ({
        fieldId: field.fieldId,
        kind: field.kind,
        accessibleName: field.accessibleName,
        groupName: field.groupName,
        autocompleteTokens: field.autocompleteTokens
      }))
    };
  }

  function analyzeCurrentPage(context = {}) {
    const startedAt = performance.now();
    const scanTarget = resolveScanTarget(context.autofillSettings);
    ensureScanObserver(scanTarget.rootMatch.node);
    const snapshot = getScanSnapshot(
      scanTarget,
      JSON.stringify(context.autofillSettings?.platformOverrides || {})
    );
    const session = {
      platform: scanTarget.adapter.name,
      root: { selector: snapshot.rootSelectorUsed },
      step: { selector: snapshot.stepSelectorUsed },
      job: scanTarget.adapter.extractJob(document, window.location),
      fields: snapshot.fields,
      submissionState: snapshot.submissionState,
      metrics: {
        ...snapshot.metrics,
        scanDurationMs: Math.round(performance.now() - startedAt),
        cacheHit: snapshot.cacheHit,
        rootSelectorUsed: snapshot.rootSelectorUsed,
        stepSelectorUsed: snapshot.stepSelectorUsed,
        attemptedScopes: snapshot.attemptedScopes
      }
    };
    return summarizeScan(session);
  }

  async function runAutofill(context) {
    const startedAt = performance.now();
    const answerContext = CORE.buildAnswerContext(context);
    const scanTarget = resolveScanTarget(context.autofillSettings);
    ensureScanObserver(scanTarget.rootMatch.node);
    const scanSnapshot = getScanSnapshot(
      scanTarget,
      JSON.stringify(context.autofillSettings?.platformOverrides || {})
    );
    const filled = [];
    const review = [];
    const skipped = [];
    const matches = [];

    for (const field of scanSnapshot.fields) {
      const match = CORE.matchResolvedField(field, answerContext, scanTarget.adapter.name);
      const entry = {
        fieldId: field.fieldId,
        label: field.questionText || field.signalText || "<unnamed>",
        kind: field.kind,
        taxonomyKey: match.taxonomyKey,
        source: match.source,
        confidence: match.confidence,
        decision: match.decision,
        reason: match.reason,
        skipReason: match.skipReason,
        selectedAnswerPreview: cleanText(match.selectedAnswer).slice(0, 120)
      };

      if (match.decision === "review") {
        review.push(entry);
        matches.push(entry);
        continue;
      }

      if (match.decision === "skip") {
        skipped.push(entry);
        matches.push(entry);
        continue;
      }

      try {
        const outcome = await fillField(field, match, scanTarget.adapter, context);
        if (outcome.filled) {
          entry.fillMethod = outcome.method;
          filled.push(entry);
        } else {
          entry.decision = "skip";
          entry.skipReason = outcome.skippedReason;
          skipped.push(entry);
        }
      } catch (error) {
        entry.decision = "skip";
        entry.skipReason = error instanceof Error ? error.message : String(error);
        skipped.push(entry);
      }
      matches.push(entry);
    }

    const matchBreakdown = matches.reduce((accumulator, item) => {
      const key = item.source || item.decision;
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    const result = {
      filled,
      review,
      skipped,
      matches,
      metrics: {
        ...scanSnapshot.metrics,
        platform: scanTarget.adapter.name,
        rootSelectorUsed: scanSnapshot.rootSelectorUsed,
        stepSelectorUsed: scanSnapshot.stepSelectorUsed,
        attemptedScopes: scanSnapshot.attemptedScopes,
        submissionState: scanSnapshot.submissionState,
        fieldCountMatched: matches.filter((item) => item.decision !== "skip" || item.source).length,
        fieldCountReview: review.length,
        fieldCountFilled: filled.length,
        fieldCountSkipped: skipped.length,
        cacheHit: scanSnapshot.cacheHit,
        mutationVersion: scanRuntime.mutationVersion,
        matchBreakdown,
        scanDurationMs: Math.round(performance.now() - startedAt)
      }
    };
    showToast(result);
    return result;
  }

  globalScope.JobmasterAutofill = {
    analyzeCurrentPage,
    runAutofill
  };
})(globalThis);
