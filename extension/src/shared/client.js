export async function callExtension(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, payload });
}

