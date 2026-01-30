import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";

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
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail file size is too big");
  }

  const arrBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrBuffer);
  const imageString = buffer.toString("base64");
  const dataUrl = `data:${file.type};base64,${imageString}`;

  const video = getVideo(cfg.db, videoId);

  if (userID !== video?.userID) {
    throw new UserForbiddenError("User is not owner");
  }

  try {
    updateVideo(cfg.db, {
      ...video,
      thumbnailURL: dataUrl,
    });
  } catch (e) {
    console.error(`error while updatding video meta data:`, e);
    throw e;
  }

  return respondWithJSON(200, null);
}
