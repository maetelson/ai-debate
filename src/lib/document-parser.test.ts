import { describe, expect, it } from "vitest";

import { chunkText, extractTextFromHtml } from "@/lib/document-parser";

describe("document parser helpers", () => {
  it("preserves meaningful html text while stripping tags", () => {
    const html = `
      <html>
        <body>
          <h1>Quarterly Plan</h1>
          <p>Launch the campaign in May.</p>
          <ul><li>Budget freeze risk</li></ul>
        </body>
      </html>
    `;

    const text = extractTextFromHtml(html);

    expect(text).toContain("QUARTERLY PLAN");
    expect(text).toContain("Launch the campaign in May.");
    expect(text).toContain("Budget freeze risk");
    expect(text).not.toContain("<h1>");
  });

  it("chunks long text with stable chunk ids", () => {
    const content = "A".repeat(1500) + "\n\n" + "B".repeat(1500);
    const chunks = chunkText("doc-1", content);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.id).toBe("doc-1-chunk-0");
    expect(chunks[1]?.id).toBe("doc-1-chunk-1");
  });
});
