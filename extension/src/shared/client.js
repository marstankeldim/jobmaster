export async function callExtension(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ action, payload });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
