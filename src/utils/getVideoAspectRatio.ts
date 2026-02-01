import { z } from "zod";

const videoStreamSchema = z.object({
  codec_type: z.literal("video"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const ffprobeSchema = z
  .object({
    streams: z.array(z.unknown()),
  })
  .transform((data, ctx) => {
    for (const stream of data.streams) {
      const parsed = videoStreamSchema.safeParse(stream);
      if (parsed.success) return parsed.data;
    }

    ctx.addIssue({
      code: "custom",
      message: "No video stream found in ffprobe output",
    });

    return z.NEVER;
  });

export type Ratio = "landscape" | "portrait" | "other";

export async function getVideoAspectRatio(path: string): Promise<Ratio> {
  const proc = Bun.spawn({
    cmd: ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", path],
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();
  const exited = await proc.exited;

  if (exited !== 0) throw new Error(`Process exited with errors ${stderrText}`);

  const { width, height } = ffprobeSchema.parse(JSON.parse(stdoutText));

  if (width > height) return "landscape";
  if (height > width) return "portrait";

  return "other";
}
