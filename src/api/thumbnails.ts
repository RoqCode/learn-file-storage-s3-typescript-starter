import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import nodePath from "node:path";
import { BadRequestError, UserForbiddenError } from "./errors";
import { randomBytes } from "node:crypto";

const MAX_UPLOAD_SIZE = 10 << 20; // 10 MB

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");

  if (!(file instanceof File))
    throw new BadRequestError("Thumbnail file missing");
  if (file.size > MAX_UPLOAD_SIZE)
    throw new BadRequestError("Thumbnail file size is too big");
  if (file.type !== "image/jpeg" && file.type !== "image/png")
    throw new BadRequestError("Thumbnail file size is too big");

  const ext = file.type.split("/").pop();
  const video = getVideo(cfg.db, videoId);

  const videoIdRnd = randomBytes(32).toString("base64url");
  const outPath = nodePath.join(cfg.assetsRoot, `${videoIdRnd}.${ext!}`);
  const arrBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrBuffer);
  await Bun.write(outPath, buffer);

  const thumbnailUrl = `http://localhost:${cfg.port}/assets/${videoIdRnd}.${ext}`;

  if (userID !== video?.userID) {
    throw new UserForbiddenError("User is not owner");
  }

  try {
    updateVideo(cfg.db, {
      ...video,
      thumbnailURL: thumbnailUrl,
    });
  } catch (e) {
    console.error(`error while updatding video meta data:`, e);
    throw e;
  }

  return respondWithJSON(200, null);
}
