/**
 * A readable answer for a GET on a capture endpoint.
 *
 * Next returns a bare 405 with an empty body when a route has no GET handler.
 * In iOS Shortcuts that surfaces as "Get Dictionary Value failed because
 * Shortcuts couldn't convert from Text to Dictionary", which says nothing about
 * the real cause: Get Contents of URL defaults to GET, and the method was never
 * switched to POST. Returning JSON here makes the Shortcut show the actual fix.
 */
export function methodHelp(endpoint: "save" | "ask" | "describe") {
  const fields: Record<string, string> = {
    save: "image (File)",
    ask: "image (File) + question (Text) — or question alone to ask across everything saved",
    describe: "image (File) + user_note (Text)",
  };

  const message =
    "This endpoint needs POST. In your Shortcut's “Get Contents of URL” action, " +
    "set Method to POST and Request Body to Form.";

  return Response.json(
    {
      error: message,
      detail: message,
      short_message: message,
      expected: {
        method: "POST",
        request_body: "Form (multipart/form-data)",
        fields: fields[endpoint],
      },
    },
    { status: 405 },
  );
}
