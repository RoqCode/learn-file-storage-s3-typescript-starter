import { respondWithJSON } from "./json";

import { type BunRequest } from "bun";
import nodePath from "node:path";
import * as uuid from "uuid";
import { getBearerToken, validateJWT } from "../auth";
import { type ApiConfig } from "../config";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getVideoAspectRatio, type Ratio } from "../utils/getVideoAspectRatio";
import { processVideoForFastStart } from "../utils/processVideoForFastStart";
import { dbVideoToSignedVideo } from "../utils/dbVideoToSignedVideo";

const MAX_UPLOAD_SIZE = 1 << 30; // 1 GB probably?

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) throw new BadRequestError("Invalid video ID");
  if (!uuid.validate(videoId)) throw new BadRequestError("Invalid video ID");

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (userID !== video?.userID) {
    throw new UserForbiddenError("User is not owner");
  }

  const formData = await req.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) throw new BadRequestError("Video is missing");
  if (file.size > MAX_UPLOAD_SIZE)
    throw new BadRequestError("Thumbnail file size is too big");
  if (file.type !== "video/mp4") throw new BadRequestError("Wrong file type");

  const videoType = file.name.split("-").pop()?.split(".").shift();
  if (!videoType) throw new BadRequestError("malformed file name");

  const ext = file.type.split("/").pop();
  const outPath = nodePath.join(
    `/tmp/tubely_temp_assets/`,
    `${videoType}.${ext!}`,
  );

  try {
    const arrBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrBuffer);
    await Bun.write(outPath, buffer);
  } catch (e) {
    console.error(`error during file write`);
    throw e;
  }

  const ratio: Ratio = await getVideoAspectRatio(outPath);
  const fileKey = `${ratio}/${videoType}.${ext!}`;

  const filePathProc = await processVideoForFastStart(outPath);

  try {
    const s3File = cfg.s3Client.file(fileKey, {
      type: file.type,
    });
    await s3File.write(Bun.file(filePathProc));
  } catch (e) {
    console.error(`error during s3 upload!`);
    throw e;
  }

  const updatedVideo = {
    ...video,
    videoURL: fileKey,
  };
  try {
    updateVideo(cfg.db, {
      ...updatedVideo,
    });

    const signedVideo = dbVideoToSignedVideo(cfg, updatedVideo);
    return respondWithJSON(200, signedVideo);
  } catch (e) {
    console.error(`error while updatding video meta data:`, e);
    throw e;
  } finally {
    Bun.file(outPath).delete();
    Bun.file(filePathProc).delete();
  }
}
