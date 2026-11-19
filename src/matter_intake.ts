import { z } from "zod";

export const matterRequest = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  competitorUrls: z.array(z.string().url()).min(1),
  deadline: z.string().datetime()
});

export type MatterRequest = z.infer<typeof matterRequest>;

export function parseMatterRequest(body: unknown): MatterRequest {
  return matterRequest.parse(body);
}
