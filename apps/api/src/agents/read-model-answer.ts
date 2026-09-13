import { z } from "zod";

import type { ModelResponse } from "./openai-responses.js";

export const readModelAnswer = (response: ModelResponse): string => {
  const messageSchema = z.object({
    type: z.literal("message"),
    content: z.array(z.object({ type: z.literal("output_text"), text: z.string() })),
  });
  const answer = response.output
    .flatMap((item) => {
      const message = messageSchema.safeParse(item);
      return message.success ? message.data.content.map((content) => content.text) : [];
    })
    .join("\n")
    .trim();
  if (!answer) throw new Error("The model did not return a text answer.");
  return answer;
};
