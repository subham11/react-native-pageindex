/**
 * Extracts the text between ```json ... ``` fences, or returns the raw string.
 * Port of `get_json_content()` from pageindex/utils.py
 */
export function getJsonContent(response: string): string {
  const start = response.indexOf('```json');
  if (start !== -1) {
    const after = response.slice(start + 7);
    const end = after.lastIndexOf('```');
    return (end !== -1 ? after.slice(0, end) : after).trim();
  }
  return response.trim();
}

/**
 * Parses a JSON string from an LLM response, handling common quirks
 * (fenced code blocks, Python `None` → JSON `null`, trailing commas).
 * Returns an empty object `{}` on failure.
 * Port of `extract_json()` from pageindex/utils.py
 */
export function extractJson(content: string): Record<string, unknown> | unknown[] {
  try {
    // Strip ```json ... ``` fences if present
    let jsonContent: string;
    const fenceStart = content.indexOf('```json');
    if (fenceStart !== -1) {
      const afterFence = content.slice(fenceStart + 7);
      const fenceEnd = afterFence.lastIndexOf('```');
      jsonContent = (fenceEnd !== -1 ? afterFence.slice(0, fenceEnd) : afterFence).trim();
    } else {
      jsonContent = content.trim();
    }

    // Common cleanup
    jsonContent = jsonContent
      .replace(/\bNone\b/g, 'null')   // Python None → JSON null
      .replace(/\bTrue\b/g, 'true')   // Python True → JSON true
      .replace(/\bFalse\b/g, 'false') // Python False → JSON false
      .replace(/\r?\n/g, ' ')         // Remove newlines
      .replace(/\s+/g, ' ');          // Normalize whitespace

    return JSON.parse(jsonContent) as Record<string, unknown> | unknown[];
  } catch {
    // Second attempt: remove trailing commas before ] or }
    try {
      let jsonContent = content.trim()
        .replace(/\bNone\b/g, 'null')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}');

      const fenceStart = jsonContent.indexOf('```json');
      if (fenceStart !== -1) {
        const afterFence = jsonContent.slice(fenceStart + 7);
        const fenceEnd = afterFence.lastIndexOf('```');
        jsonContent = (fenceEnd !== -1 ? afterFence.slice(0, fenceEnd) : afterFence).trim();
      }

      return JSON.parse(jsonContent) as Record<string, unknown> | unknown[];
    } catch {
      console.warn('[PageIndex] Failed to parse JSON from LLM response:', content.slice(0, 200));
      return {};
    }
  }
}
