declare module "html-to-text" {
  export function convert(
    html: string,
    options?: {
      wordwrap?: boolean | number;
      selectors?: Array<{
        selector: string;
        format?: string;
        options?: Record<string, unknown>;
      }>;
    }
  ): string;
}
