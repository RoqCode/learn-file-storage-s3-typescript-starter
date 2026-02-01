export async function processVideoForFastStart(inputFilePath: string) {
  const filePathArr = inputFilePath.split(".");
  const ext = filePathArr.pop();
  filePathArr.push("processed");
  filePathArr.push(ext!);
  const filePathProc = filePathArr.join(".");

  const proc = Bun.spawn({
    cmd: [
      "ffmpeg",
      "-i",
      inputFilePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      filePathProc,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();
  const exited = await proc.exited;

  if (exited !== 0) throw new Error(`Process exited with errors ${stderrText}`);

  return filePathProc;
}
