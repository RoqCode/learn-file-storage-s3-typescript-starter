import type { ApiConfig } from "../config";
import type { Video } from "../db/videos";
import { generatePresignedURL } from "./generatePresignedURL";

export function dbVideoToSignedVideo(cfg: ApiConfig, video: Video) {
  if (!video.videoURL) {
    return video;
  }

  return {
    ...video,
    videoURL: generatePresignedURL(cfg, video.videoURL, 3600),
  };
}
