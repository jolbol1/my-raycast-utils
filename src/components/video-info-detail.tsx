import { Action, ActionPanel, Detail, Icon, Keyboard } from "@raycast/api";
import DownloadThumbnail from "../download-thumbnail";
import DownloadVideo from "../download-video";
import VideoTranscript from "../video-transcript";
import { listSubtitleLanguages } from "../utils/transcript";
import {
  VideoInfo,
  formatCount,
  formatDuration,
  formatFilesize,
  formatUploadDate,
  getFormatTitle,
  getFormats,
  isLiveVideo,
  VIDEO_FORMATS_KEY,
  withProtocol,
} from "../utils/video";

export default function VideoInfoDetail({ info, url }: { info: VideoInfo; url: string }) {
  const videoUrl = info.webpage_url ?? info.original_url ?? withProtocol(url);
  const bestFormat = getFormats(info)[VIDEO_FORMATS_KEY][0];
  const languages = listSubtitleLanguages(info);
  const manualLanguages = languages.filter((language) => !language.automatic);

  return (
    <Detail
      navigationTitle={info.title}
      markdown={buildMarkdown(info)}
      metadata={
        <Detail.Metadata>
          {(info.channel ?? info.uploader) && (
            <Detail.Metadata.Link
              title="Channel"
              text={info.channel ?? info.uploader ?? ""}
              target={info.channel_url ?? info.uploader_url ?? videoUrl}
            />
          )}
          {info.channel_follower_count !== undefined && (
            <Detail.Metadata.Label title="Subscribers" text={formatCount(info.channel_follower_count)} />
          )}
          <Detail.Metadata.Label
            title="Duration"
            text={isLiveVideo(info) ? "Live" : formatDuration(info.duration) || "Unknown"}
          />
          {info.upload_date && <Detail.Metadata.Label title="Uploaded" text={formatUploadDate(info.upload_date)} />}
          {info.view_count !== undefined && <Detail.Metadata.Label title="Views" text={formatCount(info.view_count)} />}
          {info.like_count !== undefined && <Detail.Metadata.Label title="Likes" text={formatCount(info.like_count)} />}
          {info.comment_count !== undefined && (
            <Detail.Metadata.Label title="Comments" text={formatCount(info.comment_count)} />
          )}
          <Detail.Metadata.Separator />
          {info.extractor_key && <Detail.Metadata.Label title="Site" text={info.extractor_key} />}
          {bestFormat && <Detail.Metadata.Label title="Best Format" text={getFormatTitle(bestFormat)} />}
          <Detail.Metadata.Label
            title="Subtitles"
            text={
              languages.length === 0
                ? "None"
                : `${manualLanguages.length} uploaded · ${languages.length - manualLanguages.length} automatic`
            }
          />
          {info.availability && <Detail.Metadata.Label title="Availability" text={info.availability} />}
          {Boolean(info.age_limit) && <Detail.Metadata.Label title="Age Limit" text={`${info.age_limit}+`} />}
          {info.categories && info.categories.length > 0 && (
            <Detail.Metadata.TagList title="Categories">
              {info.categories.slice(0, 6).map((category) => (
                <Detail.Metadata.TagList.Item key={category} text={category} />
              ))}
            </Detail.Metadata.TagList>
          )}
          {info.tags && info.tags.length > 0 && (
            <Detail.Metadata.TagList title="Tags">
              {info.tags.slice(0, 10).map((tag) => (
                <Detail.Metadata.TagList.Item key={tag} text={tag} />
              ))}
            </Detail.Metadata.TagList>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser url={videoUrl} />
            <Action.Push
              icon={Icon.Download}
              title="Download Video"
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              target={<DownloadVideo initialUrl={videoUrl} />}
            />
            <Action.Push
              icon={Icon.Image}
              title="Show Thumbnails"
              shortcut={{ modifiers: ["cmd"], key: "t" }}
              target={<DownloadThumbnail initialUrl={videoUrl} />}
            />
            <Action.Push
              icon={Icon.Text}
              title="Get Transcript"
              shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
              target={<VideoTranscript initialUrl={videoUrl} />}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Title" content={info.title} />
            <Action.CopyToClipboard title="Copy URL" content={videoUrl} shortcut={Keyboard.Shortcut.Common.Copy} />
            {info.description && <Action.CopyToClipboard title="Copy Description" content={info.description} />}
            {(info.channel_url ?? info.uploader_url) && (
              <Action.CopyToClipboard title="Copy Channel URL" content={info.channel_url ?? info.uploader_url ?? ""} />
            )}
            <Action.CopyToClipboard title="Copy Metadata JSON" content={JSON.stringify(info, null, 2)} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

const buildMarkdown = (info: VideoInfo) => {
  const sections: string[] = [];

  if (info.thumbnail) sections.push(`![](${info.thumbnail})`);
  sections.push(`# ${info.title}`);

  const chapters = info.chapters ?? [];
  if (chapters.length > 0) {
    sections.push(
      [
        "## Chapters",
        ...chapters.map((chapter) => `- \`${formatDuration(chapter.start_time)}\` ${chapter.title}`),
      ].join("\n"),
    );
  }

  if (info.description) {
    sections.push(["## Description", info.description].join("\n\n"));
  }

  const approximateSize = getFormats(info)[VIDEO_FORMATS_KEY][0];
  const size = formatFilesize(approximateSize?.filesize ?? approximateSize?.filesize_approx);
  if (size) sections.push(`_Best quality is about ${size}._`);

  return sections.join("\n\n");
};
